import { StrictMode, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GeneratorScreen } from '../../src/components/GeneratorScreen';
import { useColorGenerator } from '../../src/hooks/useColorGenerator';
import '../../src/index.css';

type Controller = ReturnType<typeof useColorGenerator>;
export type LifecycleSnapshot = Pick<Controller, 'record' | 'notification' | 'isGenerating'>;
export type LifecycleControls = {
  events: string[];
  commits: LifecycleSnapshot[];
  generateTwice: () => void;
  confirmTwice: () => void;
};
declare global {
  interface Window {
    __lifecycle: LifecycleControls;
  }
}
let root: Root | null = null;
let controller: Controller | null = null;
const events: string[] = [];
const commits: LifecycleSnapshot[] = [];

/** App と同じ公開 hook / props を使う。テスト用の分岐はこの harness の外へ持ち出さない。 */
function HarnessApp() {
  const screen = useColorGenerator();
  useLayoutEffect(() => {
    // render の中では外部状態を変更しない。commit 後の観察値だけを保存する。
    controller = screen;
    commits.push({
      record: screen.record,
      notification: screen.notification,
      isGenerating: screen.isGenerating,
    });
  });
  useEffect(() => {
    events.push('setup');
    return () => {
      events.push('cleanup');
    };
  }, []);
  return <GeneratorScreen {...screen} />;
}

function mount() {
  if (root) return;
  root = createRoot(document.getElementById('harness-root')!);
  root.render(
    <StrictMode>
      <HarnessApp />
    </StrictMode>,
  );
}
function unmount() {
  // DOM の削除やページ遷移ではなく、React の正式な cleanup を実行する。
  root?.unmount();
  root = null;
  controller = null;
}
window.__lifecycle = {
  events,
  commits,
  generateTwice() {
    // 同じ render の callback を続けて実行し、disabled 属性とは別に同期 guard を確認する。
    const generate = controller?.onGenerate;
    generate?.();
    generate?.();
  },
  confirmTwice() {
    const confirm = controller?.onConfirm;
    confirm?.();
    confirm?.();
  },
};
document.getElementById('mount')!.addEventListener('click', mount);
document.getElementById('unmount')!.addEventListener('click', unmount);
mount();
