/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.{ts,tsx}",
  defaultStory: "components--button",
  appendToHead: `<link rel="preload" href="/src/styles/globals.css" as="style">`,
  addons: {
    a11y: { enabled: true },
    theme: {
      enabled: true,
      defaultState: "light",
    },
    width: {
      enabled: true,
      options: { mobile: 375, tablet: 768, desktop: 1280 },
      defaultState: 0,
    },
  },
};
