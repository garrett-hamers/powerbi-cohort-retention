const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

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
      },
      {
        // Compiles the side-effect `style/visual.less` import from src/visual.ts and
        // extracts it to a standalone dist/visual.css that scripts/package.js ships
        // inside the .pbiviz. `url` and `import` resolution stay off so the stylesheet
        // can never pull an external asset into a visual that must be self-contained,
        // and source maps stay off so `dist` holds exactly the artifacts the
        // certification audit expects.
        test: /\.less$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: { url: false, import: false, sourceMap: false, esModule: true }
          },
          {
            loader: "less-loader",
            options: { sourceMap: false }
          }
        ]
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "visual.css"
    })
  ],
  optimization: {
    minimize: false
  },
  externals: {
    "powerbi-visuals-api": "powerbi"
  },
  devtool: "source-map"
};
