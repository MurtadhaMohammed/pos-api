const { v4: uuidv4 } = require("uuid");

exports.generateCustomHoldId =function () {
    const uuid = uuidv4();
    return `${uuid.slice(0, 8)}-${uuid.slice(9, 13)}${uuid.slice(14, 18)}`;
  }