// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-social-media-embed", () => {
  const embed = (network: string) => {
    const FakeEmbed = ({ url, linkText }: { url: string; linkText?: string }) => (
      <div data-testid="embed" data-network={network} data-url={url}>
        {linkText}
      </div>
    );
    FakeEmbed.displayName = `FakeEmbed(${network})`;
    return FakeEmbed;
  };
  return {
    InstagramEmbed: embed("Instagram"),
    TikTokEmbed: embed("TikTok"),
    FacebookEmbed: embed("Facebook"),
    PinterestEmbed: embed("Pinterest"),
    YouTubeEmbed: embed("Youtube"),
    TwitterEmbed: embed("Twitter"),
  };
});

import SocialMedia, {
  MAX_EMBEDS,
  selectPostsToDisplay,
} from "@/app/(routes)/nosotros/components/social-media";
import { Social } from "@/constants";
import type { Post } from "@/types";

const day = (n: number) =>
  new Date(Date.UTC(2026, 8, n)).toISOString();

const post = (id: string, social: Social, dayOfMonth: number): Post => ({
  id,
  social,
  postId: `id-${id}`,
  createdAt: day(dayOfMonth),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("selectPostsToDisplay", () => {
  it("keeps only supported networks, newest first, capped at MAX_EMBEDS", () => {
    const data: Post[] = [
      post("a", Social.Instagram, 1),
      post("b", Social.Twitter, 30),
      post("c", Social.TikTok, 5),
      post("d", Social.Facebook, 9),
      post("e", Social.Youtube, 3),
      post("f", Social.Pinterest, 7),
      post("g", Social.Instagram, 8),
      post("h", Social.Instagram, 2),
    ];

    const selected = selectPostsToDisplay(data);

    expect(MAX_EMBEDS).toBe(6);
    expect(selected.map((p) => p.id)).toEqual(["d", "g", "f", "c", "e", "h"]);
    expect(selected.some((p) => p.social === Social.Twitter)).toBe(false);
  });
});

describe("SocialMedia", () => {
  it("renders nothing when there are no displayable posts", () => {
    const { container } = render(
      <SocialMedia data={[post("t", Social.Twitter, 1)]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders at most six embeds in createdAt order with Spanish placeholder copy", () => {
    const data = Array.from({ length: 8 }, (_, i) =>
      post(`p${i}`, i % 2 ? Social.TikTok : Social.Instagram, i + 1),
    );

    render(<SocialMedia data={data} />);
    // Los scripts de terceros solo se cargan cuando la persona lo pide.
    fireEvent.click(screen.getByRole("button", { name: "Cargar publicaciones" }));

    const embeds = screen.getAllByTestId("embed");
    expect(embeds).toHaveLength(6);
    expect(embeds.map((el) => el.getAttribute("data-url"))).toEqual([
      "https://www.tiktok.com/@papeleria.pdepapel/video/id-p7",
      "https://www.instagram.com/p/id-p6/",
      "https://www.tiktok.com/@papeleria.pdepapel/video/id-p5",
      "https://www.instagram.com/p/id-p4/",
      "https://www.tiktok.com/@papeleria.pdepapel/video/id-p3",
      "https://www.instagram.com/p/id-p2/",
    ]);
    embeds.forEach((el) => expect(el).toHaveTextContent("Ver publicación"));
    expect(screen.queryByTestId("social-media-placeholder")).toBeNull();
  });

  it("shows direct links and asks before loading third-party scripts, then remembers the choice", () => {
    const data = [post("i", Social.Instagram, 1), post("t", Social.TikTok, 2)];
    const { unmount } = render(<SocialMedia data={data} />);

    expect(screen.getByTestId("social-media-consent")).toHaveTextContent("scripts de TikTok y Instagram");
    expect(screen.getByRole("link", { name: /Ver en Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/p/id-i/");
    expect(screen.queryByTestId("social-media-embeds")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cargar publicaciones" }));
    expect(screen.getByTestId("social-media-embeds")).toBeInTheDocument();

    unmount();
    render(<SocialMedia data={data} />);
    expect(screen.getByTestId("social-media-embeds")).toBeInTheDocument();
  });
});
