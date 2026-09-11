import { Social } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildSocialPostUrl,
  isSupportedSocial,
  parseSocialPostId,
  SOCIAL_LABELS,
  SUPPORTED_SOCIALS,
} from "@/lib/social-posts";

const ok = (social: Social, input: string) => {
  const parsed = parseSocialPostId(social, input);
  expect(parsed.ok, `${social}: ${input}`).toBe(true);
  return parsed.ok ? parsed.postId : "";
};

const fails = (social: Social, input: string) => {
  const parsed = parseSocialPostId(social, input);
  expect(parsed.ok, `${social}: ${input}`).toBe(false);
  return parsed.ok ? "" : parsed.error;
};

describe("parseSocialPostId", () => {
  it("trims and rejects empty input with a Spanish message", () => {
    expect(fails(Social.Instagram, "   ")).toBe(
      "El identificador de la publicación es requerido",
    );
    expect(ok(Social.Instagram, "  CxYz123AbCd  ")).toBe("CxYz123AbCd");
  });

  describe("Instagram", () => {
    it("accepts a bare id, /p/ and /reel/ links", () => {
      expect(ok(Social.Instagram, "CxYz123AbCd")).toBe("CxYz123AbCd");
      expect(
        ok(Social.Instagram, "https://www.instagram.com/p/CxYz123AbCd/?igsh=abc"),
      ).toBe("CxYz123AbCd");
      expect(ok(Social.Instagram, "instagram.com/reel/C_re-el_1/")).toBe(
        "C_re-el_1",
      );
    });

    it("rejects other hosts and short codes with the documented message", () => {
      expect(fails(Social.Instagram, "https://www.tiktok.com/@x/video/1")).toBe(
        "No parece un identificador de Instagram. Pega el enlace de la publicación o el código que va después de /p/.",
      );
      expect(fails(Social.Instagram, "ab")).toContain("Instagram");
      expect(fails(Social.Instagram, "https://www.instagram.com/papeleria.pdepapel/")).toContain(
        "Instagram",
      );
    });
  });

  describe("TikTok", () => {
    it("accepts /video/<digits> links and bare digit ids", () => {
      expect(
        ok(
          Social.TikTok,
          "https://www.tiktok.com/@papeleria.pdepapel/video/7234567890123456789?is_from_webapp=1",
        ),
      ).toBe("7234567890123456789");
      expect(ok(Social.TikTok, "7234567890123456789")).toBe("7234567890123456789");
    });

    it("rejects short ids, letters and profile links", () => {
      expect(fails(Social.TikTok, "12345")).toContain("TikTok");
      expect(fails(Social.TikTok, "CxYz123AbCd")).toContain("TikTok");
      expect(fails(Social.TikTok, "https://www.tiktok.com/@papeleria.pdepapel")).toContain(
        "TikTok",
      );
    });
  });

  describe("Facebook", () => {
    it("accepts posts/<digits>, pfbid codes, fbid and permalink links", () => {
      expect(
        ok(Social.Facebook, "https://www.facebook.com/papeleria.pdepapel/posts/1234567890123"),
      ).toBe("1234567890123");
      expect(
        ok(Social.Facebook, "https://www.facebook.com/papeleria.pdepapel/posts/pfbid02AbC9xyz"),
      ).toBe("pfbid02AbC9xyz");
      expect(
        ok(Social.Facebook, "https://www.facebook.com/photo/?fbid=987654321&set=a.1"),
      ).toBe("987654321");
      expect(
        ok(Social.Facebook, "https://www.facebook.com/permalink.php?story_fbid=555555555&id=1"),
      ).toBe("555555555");
      expect(
        ok(Social.Facebook, "https://www.facebook.com/groups/1/permalink/44444444/"),
      ).toBe("44444444");
      expect(ok(Social.Facebook, "1234567890123")).toBe("1234567890123");
    });

    it("rejects page links and non-Facebook hosts", () => {
      expect(fails(Social.Facebook, "https://www.facebook.com/papeleria.pdepapel")).toContain(
        "Facebook",
      );
      expect(fails(Social.Facebook, "https://www.instagram.com/p/CxYz123AbCd/")).toContain(
        "Facebook",
      );
      expect(fails(Social.Facebook, "abc")).toContain("Facebook");
    });
  });

  describe("YouTube", () => {
    it("accepts watch?v=, youtu.be, shorts and bare 11-char ids", () => {
      expect(ok(Social.Youtube, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(ok(Social.Youtube, "https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(ok(Social.Youtube, "https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(ok(Social.Youtube, "dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("rejects ids that are not 11 characters and channel links", () => {
      expect(fails(Social.Youtube, "dQw4w9WgXc")).toContain("YouTube");
      expect(fails(Social.Youtube, "https://www.youtube.com/@papeleriapdepapel")).toContain(
        "YouTube",
      );
    });
  });

  describe("Pinterest", () => {
    it("accepts /pin/<digits> links and bare digits", () => {
      expect(
        ok(Social.Pinterest, "https://www.pinterest.com/pin/123456789012345678/"),
      ).toBe("123456789012345678");
      expect(ok(Social.Pinterest, "https://co.pinterest.com/pin/123456789012345678/")).toBe(
        "123456789012345678",
      );
      expect(ok(Social.Pinterest, "123456789012345678")).toBe("123456789012345678");
    });

    it("rejects short links and board urls", () => {
      expect(fails(Social.Pinterest, "https://pin.it/abc123")).toContain("Pinterest");
      expect(fails(Social.Pinterest, "https://www.pinterest.com/user/board/")).toContain(
        "Pinterest",
      );
      expect(fails(Social.Pinterest, "abc")).toContain("Pinterest");
    });
  });

  describe("Twitter / X", () => {
    it("accepts /status/<digits> on twitter.com and x.com plus bare digits", () => {
      expect(ok(Social.Twitter, "https://x.com/someone/status/1700000000000000000")).toBe(
        "1700000000000000000",
      );
      expect(
        ok(Social.Twitter, "https://twitter.com/someone/status/1700000000000000000?s=20"),
      ).toBe("1700000000000000000");
      expect(ok(Social.Twitter, "1700000000000000000")).toBe("1700000000000000000");
    });

    it("rejects profile links", () => {
      expect(fails(Social.Twitter, "https://x.com/someone")).toContain("X (Twitter)");
    });
  });
});

describe("buildSocialPostUrl", () => {
  it("builds the same canonical urls the storefront embeds", () => {
    expect(buildSocialPostUrl(Social.Instagram, "CxYz123AbCd")).toBe(
      "https://www.instagram.com/p/CxYz123AbCd/",
    );
    expect(buildSocialPostUrl(Social.TikTok, "7234567890123456789")).toBe(
      "https://www.tiktok.com/@papeleria.pdepapel/video/7234567890123456789",
    );
    expect(buildSocialPostUrl(Social.Facebook, "1234567890123")).toBe(
      "https://www.facebook.com/papeleria.pdepapel/posts/1234567890123",
    );
    expect(buildSocialPostUrl(Social.Youtube, "dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(buildSocialPostUrl(Social.Pinterest, "123456789012345678")).toBe(
      "https://www.pinterest.com/pin/123456789012345678/",
    );
    // No hay cuenta en X: la URL no lleva usuario.
    expect(buildSocialPostUrl(Social.Twitter, "1700000000000000000")).toBe(
      "https://x.com/i/status/1700000000000000000",
    );
  });
});

describe("supported networks", () => {
  it("lists exactly what the storefront renders, without Twitter", () => {
    expect([...SUPPORTED_SOCIALS]).toEqual([
      "Instagram",
      "TikTok",
      "Facebook",
      "Youtube",
      "Pinterest",
    ]);
    expect(isSupportedSocial("Twitter")).toBe(false);
    expect(isSupportedSocial("Instagram")).toBe(true);
    expect(isSupportedSocial(undefined)).toBe(false);
  });

  it("has a Spanish label for every enum member", () => {
    for (const social of Object.values(Social)) {
      expect(SOCIAL_LABELS[social]).toBeTruthy();
    }
    expect(SOCIAL_LABELS.Youtube).toBe("YouTube");
    expect(SOCIAL_LABELS.Twitter).toBe("X (Twitter)");
  });
});
