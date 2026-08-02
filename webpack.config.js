const path = require("path");

module.exports = {
  entry: "./src/visual.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "visual.js",
    libraryTarget: "var",
    library: "AtlynCohortRetention"
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: "ts-loader"
      }
    ]
  },
  optimization: {
    minimize: false
  },
  externals: {
    "powerbi-visuals-api": "powerbi"
  },
  devtool: "source-map"
};
