import { render } from "@solidjs/web";
import "./styles.css";

const root = document.querySelector("#root");
if (root === null) throw new Error("no #root element");

render(() => <main class="p-8 text-ink">driver</main>, root);
