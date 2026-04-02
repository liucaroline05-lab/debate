const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatDate = (value: string) => dateFormatter.format(new Date(value));

export const formatDateTime = (value: string) =>
  dateTimeFormatter.format(new Date(value));
