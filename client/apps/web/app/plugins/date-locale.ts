// The dayjs locales the language plugin names as `bmoUi.dateLocale`, loaded once for the server and the
// browser alike, as bmo-ui asks of its host; English is dayjs's own.
import "dayjs/locale/ja";
import "dayjs/locale/ko";
import "dayjs/locale/zh-cn";

export default defineNuxtPlugin(() => {});
