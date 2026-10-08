import { describe, expect, it } from "vitest";

import { isInAppBrowser } from "@/lib/in-app-browser";

const IN_APP = {
  "Instagram iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.31.98 (iPhone14,5; iOS 17_5; es_CO; es; scale=3.00; 1170x2532; 627400398)",
  "Instagram Android":
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.43.89 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; es_CO; 642336473)",
  "Facebook iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5;FBRV/0]",
  "Facebook Android":
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.43.109;]",
};

const REGULAR = {
  "Safari iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Chrome Android":
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Samsung Internet":
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  "Chrome desktop":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "facebookexternalhit": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Facebot: "Facebot",
};

describe("isInAppBrowser", () => {
  it.each(Object.entries(IN_APP))("detects %s", (_, ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each(Object.entries(REGULAR))("leaves %s alone", (_, ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });

  it("treats a missing user agent as a regular browser", () => {
    expect(isInAppBrowser(undefined)).toBe(false);
    expect(isInAppBrowser("")).toBe(false);
  });
});
