import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        xs: "375px",
        s: "425px",
        "2xl": "1400px",
      },
    },
    extend: {
      zIndex: {
        "1": "1",
      },
      boxShadow: {
        card: "20px 20px 30px rgba(0,0,0,0.02)",
        "card-hover": "20px 20px 30px rgba(0,0,0,0.06)",
        badge: "0 0px 10px",
      },
      transformOrigin: {
        "left-center": "left center",
      },
      screens: {
        xxs: "320px",
        xs: "375px",
        s: "425px",
      },
      spacing: {
        "9/10": "90%",
      },
      fontSize: {
        xxs: [
          "0.625rem",
          {
            lineHeight: "1rem",
          },
        ],
        "5.5xl": "3.5rem",
      },
      fontFamily: {
        mono: ["var(--font-caudex)", ...fontFamily.mono],
        sans: ["var(--font-beautiful-every-time-regular)", ...fontFamily.sans],
        serif: ["var(--font-nunito)", ...fontFamily.serif],
        roboto: ["var(--font-roboto)", ...fontFamily.sans],
      },
      colors: {
        white: {
          DEFAULT: "hsl(var(--white) / <alpha-value>)",
          rock: "hsl(var(--white-rock) / <alpha-value>)",
        },

        yellow: {
          star: "hsl(var(--yellow-star) / <alpha-value>)",
        },

        pink: {
          shell: "hsl(var(--clam-shell) / <alpha-value>)",
          froly: "hsl(var(--froly) / <alpha-value>)",
        },

        blue: {
          yankees: "hsl(var(--yankees-blue) / <alpha-value>)",
          baby: "hsl(var(--baby-blue) / <alpha-value>)",
          purple: "hsl(var(--blue-purple) / <alpha-value>)",
        },

        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "dot-pulse": {
          "0%": { opacity: "0" },
          "25%": { opacity: "1" },
          "50%": { opacity: "0" },
          "100%": { opacity: "0" },
        },
        "move-marker": {
          "10%": { transform: "translate(5%, 100%) rotate(2.5deg)" },
          "20%": { transform: "translate(20%, 0%) rotate(-5deg)" },
          "30%": { transform: "translate(30%, 100%) rotate(2.5deg)" },
          "40%": { transform: "translate(40%, 0%) rotate(-5deg)" },
          "50%": { transform: "translate(50%, 100%) rotate(2.5deg)" },
          "60%": { transform: "translate(60%, 0%) rotate(-5deg)" },
          "70%": { transform: "translate(70%, 100%) rotate(2.5deg)" },
          "80%": { transform: "translate(80%, 0%) rotate(-5deg)" },
          "90%": { transform: "translate(90%, 100%) rotate(2.5deg)" },
          "100%": { transform: "translate(100%, 0%) rotate(-5deg)" },
        },
        "rainbow-fill": {
          "0%": {
            background: `var(--bg-01-a), var(--bg-02-a), var(--bg-03-a), var(--bg-04-a),
            var(--bg-05-a), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "10%": {
            background: `var(--bg-01-b), var(--bg-02-a), var(--bg-03-a), var(--bg-04-a),
            var(--bg-05-a), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "20%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-a), var(--bg-04-a),
            var(--bg-05-a), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "30%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-a),
            var(--bg-05-a), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "40%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-a), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "50%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-a), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "60%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-b), var(--bg-07-a), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "70%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-b), var(--bg-07-b), var(--bg-08-a),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "80%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-b), var(--bg-07-b), var(--bg-08-b),
            var(--bg-09-a), var(--bg-10-a)`,
          },
          "90%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-b), var(--bg-07-b), var(--bg-08-b),
            var(--bg-09-b), var(--bg-10-a)`,
          },
          "100%": {
            background: `var(--bg-01-b), var(--bg-02-b), var(--bg-03-b), var(--bg-04-b),
            var(--bg-05-b), var(--bg-06-b), var(--bg-07-b), var(--bg-08-b),
            var(--bg-09-b), var(--bg-10-b)`,
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 20px hsl(var(--froly) / 0.5)",
          },
          "50%": {
            boxShadow:
              "0 0 40px hsl(var(--froly) / 0.8), 0 0 60px hsl(var(--froly) / 0.4)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "move-marker": "infinite alternate move-marker 5000ms ease-in-out",
        "rainbow-fill": "infinite alternate rainbow-fill 5000ms ease-in-out",
        "dot-pulse": "dot-pulse 1s infinite",
        shimmer: "shimmer 2s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
