const dayjs = require("dayjs");

const getDateDifferenceType = (startDate, endDate) => {
  const start = dayjs(startDate).startOf("day");
  const end = dayjs(endDate).endOf("day");

  const diffInDays = end.diff(start, "day");

  if (diffInDays > 30) return "year";
  if (diffInDays > 7) return "month";
  if (diffInDays > 1) return "week";

  return "day";
};

module.exports = getDateDifferenceType;
