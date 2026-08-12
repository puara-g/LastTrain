require("dotenv").config();
const express = require("express");
const cors = require("cors");
const lastTrainRouter = require("./routes/lastTrain");
const routeRouter = require("./routes/route");
const quickExitRouter = require("./routes/quickExit");
const quickExitApi = require("./services/quickExitApi");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api", lastTrainRouter);
app.use("/api", routeRouter);
app.use("/api", quickExitRouter);

app.listen(PORT, () => {
  console.log(`LastTrain backend listening on http://localhost:${PORT}`);
  quickExitApi.warmUp();
});
