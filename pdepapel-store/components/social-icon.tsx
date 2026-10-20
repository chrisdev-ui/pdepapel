import type { LucideProps } from "lucide-react";

import { FacebookIcon, InstagramIcon, TiktokIcon, YoutubeIcon } from "@/components/icons";
import type { StoreSocialNetwork } from "@/lib/social-links";

const ICONS: Record<StoreSocialNetwork, (props: LucideProps) => JSX.Element> = {
  instagram: InstagramIcon,
  tiktok: TiktokIcon,
  facebook: FacebookIcon,
  youtube: YoutubeIcon,
};

/** La marca de cada red, monocroma (`currentColor`) como el resto de los íconos. */
export function SocialIcon({ network, ...props }: LucideProps & { network: StoreSocialNetwork }) {
  const Icon = ICONS[network];
  return <Icon aria-hidden="true" {...props} />;
}
