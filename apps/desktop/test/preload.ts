import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { transform } from "@solidjs/compiler";
import { plugin } from "bun";

GlobalRegistrator.register();
Reflect.set(globalThis, "__UI_SDK_STRICT__", true);

plugin({
  name: "solid-jsx",
  setup(build) {
    build.onLoad({ filter: /\/apps\/desktop\/(src|test)\/.*\.tsx$/ }, async ({ path }) => ({
      contents: transform(await Bun.file(path).text(), { filename: path, dev: true }).code,
      loader: "ts",
    }));
  },
});
