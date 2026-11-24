import data from "../../apps/web/i18n/data/ko.yaml";

// The first label each kind has in the data file beside the language pack, as a chat client keeps it for a line that
// carried that thing and no words, a count of pictures standing at two.
const labels = (data as { marks: { labels: { picture: string[]; pictures: string[]; video: string[]; sticker: string[] } } }).marks.labels;

export const LABELS = {
  picture: labels.picture[0]!,
  pictures: labels.pictures[0]!.replace("{n}", "2"),
  video: labels.video[0]!,
  sticker: labels.sticker[0]!
};
