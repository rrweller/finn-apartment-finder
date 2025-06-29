export const fmtThousands = n =>
  n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
