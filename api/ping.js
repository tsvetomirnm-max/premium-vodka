export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    name: "Premium Vodka",
    time: new Date().toISOString(),
  });
}
