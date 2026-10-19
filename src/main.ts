import './styles/main.css';
import { Game } from './game/Game';

function boot(): void {
  let game: Game;
  try {
    game = new Game();
  } catch (err) {
    console.error(err);
    const msg = document.createElement('div');
    msg.className = 'title-screen';
    msg.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'title-screen__inner';
    const h = document.createElement('h1');
    h.className = 'title-screen__logo';
    h.textContent = '天堂';
    const p = document.createElement('p');
    p.className = 'title-screen__tag';
    p.textContent = '無法啟動 3D 繪圖（WebGL）。請改用最新版的 Chrome、Edge、Safari 或 Firefox，並確認已開啟硬體加速。';
    inner.append(h, p);
    msg.append(inner);
    document.body.append(msg);
    return;
  }
  game.showTitle();
  if (import.meta.env.DEV) {
    (window as unknown as { __debug: unknown }).__debug = game.debugApi();
  }
}

boot();
