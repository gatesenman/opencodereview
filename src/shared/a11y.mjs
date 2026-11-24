function isActivateKey(key) {
  return key === "Enter" || key === " ";
}

function isCancelKey(key) {
  return key === "Escape";
}

export { isActivateKey, isCancelKey };
