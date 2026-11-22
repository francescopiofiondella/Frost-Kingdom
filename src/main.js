import { Game } from "./game.js";
import { UI } from "./ui.js";

const ui = new UI();
try {
  const game = new Game(document.getElementById("game"), ui);
  window.__game = game; // utile per il debug da console
  await game.init((text, p) => ui.setLoading(text, p));
  ui.setLoading("Pronto", 1);
  ui.hideLoading();
  game.start();
} catch (e) {
  ui.showError(e);
}
