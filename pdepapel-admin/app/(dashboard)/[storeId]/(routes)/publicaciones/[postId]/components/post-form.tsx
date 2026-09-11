"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eraser, ExternalLink, Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  buildSocialPostUrl,
  isSupportedSocial,
  parseSocialPostId,
  SOCIAL_ID_HELP,
  SOCIAL_LABELS,
  SUPPORTED_SOCIALS,
  UNSUPPORTED_SOCIAL_MESSAGE,
} from "@/lib/social-posts";
import { Post, Social } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const formSchema = z
  .object({
    social: z.nativeEnum(Social, {
      errorMap: () => ({ message: "Elige una red social" }),
    }),
    postId: z
      .string()
      .trim()
      .min(1, "Pega el enlace o el identificador de la publicación"),
  })
  .superRefine((values, ctx) => {
    if (!isSupportedSocial(values.social)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["social"],
        message: UNSUPPORTED_SOCIAL_MESSAGE,
      });
      return;
    }
    const parsed = parseSocialPostId(values.social, values.postId);
    if (!parsed.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postId"],
        message: parsed.error,
      });
    }
  });

type PostFormValues = z.infer<typeof formSchema>;

interface PostFormProps {
  initialData: Post | null;
}

export const PostForm: React.FC<PostFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar publicación" : "Nueva publicación",
      description: initialData
        ? "Cambia la red o el identificador de una publicación que se muestra en la tienda."
        : "Muestra en la página Nosotros de la tienda una publicación de tus redes.",
      toastMessage: initialData
        ? "Publicación actualizada"
        : "Publicación creada",
      action: initialData ? "Guardar cambios" : "Crear publicación",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  const defaultValues = useMemo<Partial<PostFormValues>>(
    () =>
      initialData
        ? { social: initialData.social, postId: initialData.postId }
        : { social: undefined, postId: "" },
    [initialData],
  );

  const form = useForm<PostFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `post-form-${params.storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  useFormValidationToast({ form });

  const social = form.watch("social");
  const postIdInput = form.watch("postId");

  // Un registro antiguo puede estar en una red que ya no se muestra: se deja
  // ver en el selector para que la persona pueda cambiarla, pero no se ofrece
  // para nuevas publicaciones.
  const selectableSocials = useMemo<Social[]>(() => {
    const base: Social[] = [...SUPPORTED_SOCIALS];
    if (initialData && !isSupportedSocial(initialData.social)) {
      base.push(initialData.social);
    }
    return base;
  }, [initialData]);

  const preview = useMemo(() => {
    if (!social || !postIdInput?.trim()) return null;
    const parsed = parseSocialPostId(social, postIdInput);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    return {
      ok: true as const,
      postId: parsed.postId,
      url: buildSocialPostUrl(social, parsed.postId),
    };
  }, [social, postIdInput]);

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (data: PostFormValues) => {
    const parsed = parseSocialPostId(data.social, data.postId);
    if (!parsed.ok) {
      form.setError("postId", { message: parsed.error });
      return;
    }
    const payload = { social: data.social, postId: parsed.postId };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Posts}/${initialData.id}`,
          payload,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Posts}`, payload);
      }
      clearStorage();
      router.refresh();
      router.push(`/${params.storeId}/contenido?tab=redes`);
      toast({
        description: toastMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/${Models.Posts}/${initialData.id}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/contenido?tab=redes`);
      toast({
        description: "Publicación eliminada",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      {leaveDialog}
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={async () => {
              if (await confirmLeave()) router.push(`/${params.storeId}/contenido?tab=redes`);
            }}
            aria-label="Volver a Redes en la tienda"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
            Limpiar formulario
          </Button>
          {initialData && (
            <Button
              disabled={loading}
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
              aria-label="Eliminar publicación"
            >
              <Trash className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <div className="grid gap-6 md:grid-cols-3">
            <FormField
              control={form.control}
              name="social"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Red social</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Red social">
                        <SelectValue placeholder="Selecciona una red social" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectableSocials.map((option) => (
                        <SelectItem key={option} value={option}>
                          {SOCIAL_LABELS[option]}
                          {!isSupportedSocial(option) &&
                            " (ya no se muestra en la tienda)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  <FormDescription>
                    La red social de donde se toma la publicación. La tienda
                    muestra Instagram, TikTok, Facebook, YouTube y Pinterest.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postId"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel isRequired>
                    Enlace o identificador de la publicación
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Pega aquí el enlace de la publicación"
                      autoComplete="off"
                      inputMode="url"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    {social
                      ? SOCIAL_ID_HELP[social]
                      : "Elige primero la red social para ver dónde encontrar el identificador."}
                  </FormDescription>
                  {preview && (
                    <p
                      className="text-sm"
                      role="status"
                      aria-live="polite"
                      data-testid="post-id-preview"
                    >
                      {preview.ok ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                          <span>
                            Identificador detectado:{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                              {preview.postId}
                            </code>
                          </span>
                          <a
                            href={preview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Ver publicación
                            <ExternalLink
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </a>
                        </span>
                      ) : (
                        <span className="text-destructive">{preview.error}</span>
                      )}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </div>
          <Button
            isLoading={loading}
            loadingText={pendingText}
            className="ml-auto"
            type="submit"
          >
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
