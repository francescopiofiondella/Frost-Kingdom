// Tastiera + mouse. down() = tenuto premuto, pressed() = appena premuto in questo frame.
// Codici mouse: "Mouse0" sinistro, "Mouse2" destro.
export class Input {
  constructor(canvas){
    this.keys = new Set(); this._pressed = new Set(); this.canvas = canvas; this.dx = 0; this.dy = 0; this.wheel = 0;
    const locked = () => document.pointerLockElement === canvas;
    addEventListener("keydown", e => {
      if (!e.repeat){ this._pressed.add(e.code); }
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", e => this.keys.delete(e.code));
    addEventListener("blur", () => { this.keys.clear(); });
    canvas.addEventListener("click", () => { if (!locked()) canvas.requestPointerLock?.(); });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    addEventListener("mousedown", e => { if (!locked()) return; const c = "Mouse" + e.button; this.keys.add(c); this._pressed.add(c); });
    addEventListener("mouseup", e => this.keys.delete("Mouse" + e.button));
    addEventListener("mousemove", e => { if (locked()){ this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener("wheel", e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }
  down(code){ return this.keys.has(code); }
  pressed(code){ return this._pressed.has(code); }
  consumeLook(){ const r = [this.dx, this.dy, this.wheel]; this.dx = this.dy = this.wheel = 0; return r; }
  endFrame(){ this._pressed.clear(); }
}
