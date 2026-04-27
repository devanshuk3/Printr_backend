const handleError = (res, err, customMsg = "Something went wrong. Please try again later.") => {
  console.error(`${customMsg}:`, err.message || err);
  return res.status(500).json({ message: customMsg });
};
module.exports = handleError;
