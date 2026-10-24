// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("recharts", () => {
  const Empty = () => null;
  return { CartesianGrid: Empty, Line: Empty, LineChart: Empty, ResponsiveContainer: Empty, Tooltip: Empty, XAxis: Empty, YAxis: Empty };
});

import { PostCurveDialog } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/post-curve-dialog";
import type { SocialPostSummary } from "@/lib/social/report";

/** El detalle de una publicación muestra su miniatura, más grande, para reconocerla sin abrir la red. */
const post = {
  id: "post-1",
  platform: "INSTAGRAM",
  productType: "REELS",
  caption: "Un kit bonito puede cambiar tu día",
  permalink: "https://www.instagram.com/reel/abc/",
  thumbnailUrl: "https://scontent.example.com/miniatura.jpg",
  postedAt: "2026-10-20T15:00:00.000Z",
  views: 900,
  reach: 800,
  likes: 40,
  comments: 3,
  shares: 2,
  saves: 5,
  totalInteractions: 50,
  avgWatchTimeMs: null,
  totalWatchSeconds: null,
  skipRate: null,
  durationSec: null,
  watchedPct: null,
  retentionWarning: false,
  retentionReasons: [],
  skipMedian: null,
  engagementRate: null,
  views3h: null,
  views24h: null,
  views7d: null,
  multiplier: null,
  multiplierApprox: false,
  multiplierSample: 0,
  tags: { FORMATO: [], GANCHO: [] },
  pieceId: null,
  pieceSuggestions: [],
} as SocialPostSummary;

const open = (value: SocialPostSummary) =>
  render(
    <PostCurveDialog storeId="store-1" tagOptions={{ FORMATO: [], GANCHO: [] }} posts={[value]} pieces={[]} post={value} onClose={() => {}} onChanged={async () => {}} />,
  );

afterEach(cleanup);

describe("miniatura en el detalle de la publicación", () => {
  it("muestra la miniatura grande junto al texto, sin pasar por Cloudinary", () => {
    open(post);
    const dialog = screen.getByRole("dialog");
    const image = within(dialog).getByRole("presentation");
    expect(image).toHaveAttribute("src", post.thumbnailUrl);
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image.className).toContain("h-28");
    expect(within(dialog).getByRole("heading", { name: post.caption! })).toBeInTheDocument();
  });

  it("si la dirección venció o no hay miniatura, se ve el marcador neutro", () => {
    open(post);
    fireEvent.error(within(screen.getByRole("dialog")).getByRole("presentation"));
    expect(within(screen.getByRole("dialog")).getByTestId("miniatura-vacia")).toBeInTheDocument();
    cleanup();

    open({ ...post, thumbnailUrl: null });
    expect(within(screen.getByRole("dialog")).getByTestId("miniatura-vacia")).toBeInTheDocument();
  });
});
