const fs = require("fs");
const path = require("path");
const webpack = require("webpack");

// Minimal .env loader (no dependency): KEY=VALUE lines, real environment
// variables win. In CI the values come from GitHub Actions secrets instead.
function loadEnv() {
  const file = path.resolve(__dirname, ".env");
  const fromFile = {};
  if (fs.existsSync(file)) {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && !line.trim().startsWith("#")) {
          fromFile[m[1]] = m[2];
        }
      });
  }
  return (key) => process.env[key] || fromFile[key] || "";
}

const env = loadEnv();
if (!env("TURN_USERNAME") || !env("TURN_CREDENTIAL")) {
  console.warn(
    "TURN_USERNAME / TURN_CREDENTIAL not set: building with STUN only (no relay fallback)."
  );
}

module.exports = {
  entry: "./src/index.ts",
  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    // Baked into the bundle at build time, so the credential never lives in
    // the repo. (It is still readable in the deployed JavaScript.)
    new webpack.DefinePlugin({
      __TURN_USERNAME__: JSON.stringify(env("TURN_USERNAME")),
      __TURN_CREDENTIAL__: JSON.stringify(env("TURN_CREDENTIAL")),
    }),
  ],
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    static: path.resolve(__dirname, "dist"),
    compress: true,
  },
};
