import { execSync } from "child_process";
import CopyPlugin from "copy-webpack-plugin";
import ESLintPlugin from "eslint-webpack-plugin";
import express from "express";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cfState = { cookie: "", ua: "" };
const workers = [...Array(100)].map((_, i) => `/w${i}`);

const gitCommit =
  process.env.GIT_COMMIT ?? execSync("git rev-parse HEAD").toString().trim();

export default async (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/client/Main.ts",
    output: {
      publicPath: "/",
      filename: "js/[name].[contenthash].js", // Added content hash
      path: path.resolve(__dirname, "static"),
      clean: isProduction,
    },
    module: {
      rules: [
        {
          test: /\.bin$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "binary/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.txt$/,
          type: "asset/source",
        },
        {
          test: /\.md$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "text/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                importLoaders: 1,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: ["tailwindcss", "autoprefixer"],
                },
              },
            },
          ],
        },
        {
          test: /\.(webp|png|jpe?g|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.html$/,
          use: ["html-loader"],
        },
        {
          test: /\.svg$/,
          type: "asset/resource", // Changed from asset/inline for caching
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf|xml)$/,
          type: "asset/resource", // Changed from file-loader
          generator: {
            filename: "fonts/[name].[contenthash][ext]", // Added content hash and fixed path
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "protobufjs/minimal": path.resolve(
          __dirname,
          "node_modules/protobufjs/minimal.js",
        ),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/client/index.html",
        filename: "index.html",
        // Add optimization for HTML
        minify: isProduction
          ? {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
              removeScriptTypeAttributes: true,
              removeStyleLinkTypeAttributes: true,
              useShortDoctype: true,
            }
          : false,
      }),
      new webpack.DefinePlugin({
        "process.env.WEBSOCKET_URL": JSON.stringify(
          isProduction ? "" : "localhost:3000",
        ),
        "process.env.GAME_ENV": JSON.stringify(isProduction ? "prod" : "dev"),
        "process.env.GIT_COMMIT": JSON.stringify(gitCommit),
        "process.env.STRIPE_PUBLISHABLE_KEY": JSON.stringify(
          process.env.STRIPE_PUBLISHABLE_KEY,
        ),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "resources"),
            to: path.resolve(__dirname, "static"),
            noErrorOnMissing: true,
            globOptions: {
              ignore: ["resources/maps/**/*"],
            },
          },
        ],
        options: { concurrency: 100 },
      }),
      new ESLintPlugin({
        context: __dirname,
      }),
    ],
    optimization: {
      // Add optimization configuration for better caching
      runtimeChunk: "single",
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      },
    },
    devServer: isProduction
      ? {}
      : {
          devMiddleware: { writeToDisk: true },
          static: {
            directory: path.join(__dirname, "static"),
          },
          historyApiFallback: true,
          compress: true,
          port: 9000,
          setupMiddlewares: (middlewares, devServer) => {
            const app = devServer.app;

            // CORS so you can post from a bookmarklet
            app.use((req, res, next) => {
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
              res.setHeader("Access-Control-Allow-Headers", "content-type");
              if (req.method === "OPTIONS") return res.end();
              next();
            });

            app.use(express.json());

            app.post("/__dev/set-cf", (req, res) => {
              const { cookie, ua } = req.body ?? {};
              if (typeof cookie === "string") cfState.cookie = cookie;
              if (typeof ua === "string") cfState.ua = ua;
              res.json({
                ok: true,
                cookieSet: !!cfState.cookie,
                uaSet: !!cfState.ua,
              });
            });

            app.get("/__dev/get-cf", (_req, res) => res.json(cfState));

            return middlewares;
          },
          proxy: [
            {
              context: ["/socket", ...workers],
              target: "wss://openfront.io",
              ws: true,
              secure: true,
              changeOrigin: true, // sets Host: openfront.io for the upstream hop
              logLevel: "debug",

              // Ensure the WS handshake looks like a real browser visiting openfront.io
              onProxyReqWs(proxyReq, req, socket, options, head) {
                proxyReq.setHeader("Origin", "https://openfront.io");
                const h = req.headers;
                [
                  "user-agent",
                  "accept-language",
                  "sec-ch-ua",
                  "sec-ch-ua-mobile",
                  "sec-ch-ua-platform",
                  "sec-websocket-extensions",
                  "sec-websocket-key",
                  "sec-websocket-version",
                  "upgrade",
                  "connection",
                ].forEach((k) => {
                  if (h[k]) proxyReq.setHeader(k, h[k]);
                });
              },
            },
            // Original API endpoints
            {
              context: [
                "/api/env",
                "/api/game",
                "/api/public_lobbies",
                "/api/join_game",
                "/api/start_game",
                "/api/create_game",
                "/api/archive_singleplayer_game",
                "/api/auth/callback",
                "/api/auth/discord",
                "/api/kick_player",
              ],
              target: "https://openfront.io",
              secure: true,
              changeOrigin: true,
              cookieDomainRewrite: "localhost",
              logLevel: "debug",

              onProxyReq(proxyReq, req) {
                // Present as if the page is on openfront.io
                proxyReq.setHeader("Origin", "https://openfront.io");
                proxyReq.setHeader("Referer", "https://openfront.io/");

                // Use a real-browser UA and forward browser-y headers if the client sent them
                const h = req.headers;
                const pass = [
                  "user-agent",
                  "accept",
                  "accept-language",
                  "sec-ch-ua",
                  "sec-ch-ua-mobile",
                  "sec-ch-ua-platform",
                  "sec-fetch-site",
                  "sec-fetch-mode",
                  "sec-fetch-dest",
                  "sec-fetch-user",
                ];
                pass.forEach((k) => {
                  if (h[k]) proxyReq.setHeader(k, h[k]);
                });
                if (cfState.ua) proxyReq.setHeader("User-Agent", cfState.ua);

                // **Key bit**: send Cloudflare clearance on the upstream hop
                if (cfState.cookie)
                  proxyReq.setHeader("Cookie", cfState.cookie);
              },

              onProxyRes(proxyRes) {
                const sc = proxyRes.headers["set-cookie"];
                if (Array.isArray(sc)) {
                  proxyRes.headers["set-cookie"] = sc.map((c) =>
                    c.replace(/; *Secure/gi, ""),
                  );
                }
              },
            },
          ],
        },
  };
};
