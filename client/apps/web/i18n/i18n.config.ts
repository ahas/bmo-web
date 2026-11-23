// The engine's own settings for the console's packs (docs/web.md, 「Wording and the language pack」): a key a
// language's pack lacks — a bundle's word in a language the bundle does not carry — reads as the Korean source's.
export default defineI18nConfig(() => ({
  fallbackLocale: "ko",
  fallbackWarn: false
}));
