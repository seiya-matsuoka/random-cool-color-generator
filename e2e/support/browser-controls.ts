/** Node から渡す値は serialize される。init script は外側の import・変数を参照できない。 */
export type DigestMode = 'native' | 'known' | 'other' | 'reject' | 'defer';
export type CopyMode = 'success' | 'reject' | 'defer' | 'native';
export type StorageMethod = 'getItem' | 'setItem' | 'removeItem';
export type ApiCall = { api: string; argument: string; state: 'pending' | 'resolved' | 'rejected' };
export type ControlOptions = {
  origin: string;
  initialDigest: DigestMode;
  initialFaults: string[];
  knownHash: string;
};
export type BrowserControls = {
  digestMode: DigestMode;
  copyMode: CopyMode;
  digestQueue: DigestMode[];
  calls: ApiCall[];
  faults: string[];
  blockStorage: boolean;
  raw: (key: string) => string | null;
  finishDigest: (index: number, hash?: string) => Promise<void>;
  finishCopy: (index: number, success?: boolean) => Promise<void>;
  drain: () => Promise<void>;
};
declare global {
  interface Window {
    __test: BrowserControls;
  }
}

/**
 * browser 内で実行するテスト専用 API 境界。
 * 実アプリ・Story から import しない。保存はこの context の本物の Storage に委譲する。
 */
export function installControls(options: ControlOptions) {
  // newPage の about:blank は保存領域を持たない。対象 origin の document だけに注入する。
  if (location.origin !== options.origin) return;
  const storage = window.localStorage;
  // prototype の関数は任意の Storage receiver に .call するため、ここでは bind しない。
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeGet = Storage.prototype.getItem;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeSet = Storage.prototype.setItem;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeRemove = Storage.prototype.removeItem;
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  const nativeUuid = crypto.randomUUID.bind(crypto);
  const nativeClipboard = navigator.clipboard;
  const nativeCopy = nativeClipboard?.writeText.bind(nativeClipboard);
  type Pending<T> = { resolve: (value: T) => void; reject: (reason: Error) => void };
  const digests = new Map<number, Pending<ArrayBuffer>>();
  const copies = new Map<number, Pending<void>>();
  const bytes = (hash: string) =>
    Uint8Array.from(hash.match(/../g) ?? [], (v) => parseInt(v, 16)).buffer;
  // 任意のミリ秒待機ではなく、Promise の反映と次の描画機会まで待つ。
  // 「古い通知が出ない」の検査を、API 完了前に通してしまうことを防ぐ。
  const drain = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };
  const control: BrowserControls = {
    digestMode: options.initialDigest,
    copyMode: 'success',
    digestQueue: [],
    calls: [],
    faults: [...options.initialFaults],
    blockStorage: false,
    // 診断用の読み取りはアプリの呼び出し回数に混ぜない。
    raw: (key) => nativeGet.call(storage, key),
    drain,
    async finishDigest(index, hash = options.knownHash) {
      const pending = digests.get(index);
      if (!pending) throw new Error(`No pending digest ${index}`);
      digests.delete(index);
      pending.resolve(bytes(hash));
      await drain();
    },
    async finishCopy(index, success = true) {
      const pending = copies.get(index);
      if (!pending) throw new Error(`No pending copy ${index}`);
      copies.delete(index);
      if (success) pending.resolve();
      else pending.reject(new DOMException('Test clipboard rejection', 'NotAllowedError'));
      await drain();
    },
  };
  window.__test = control;

  function call(api: string, argument: string) {
    const entry: ApiCall = { api, argument, state: 'pending' };
    control.calls.push(entry);
    return entry;
  }
  async function track<T>(entry: ApiCall, task: Promise<T>): Promise<T> {
    try {
      const value = await task;
      entry.state = 'resolved';
      return value;
    } catch (error) {
      entry.state = 'rejected';
      throw error;
    }
  }
  let digestIndex = 0;
  crypto.subtle.digest = (algorithm, input) => {
    const seed = new TextDecoder().decode(input);
    const entry = call('digest', seed);
    const index = digestIndex++;
    const mode = control.digestQueue.shift() ?? control.digestMode;
    if (mode === 'native') return track(entry, nativeDigest(algorithm, input));
    if (mode === 'reject') return track(entry, Promise.reject(new Error('Test digest rejection')));
    if (mode === 'defer') {
      return track(
        entry,
        new Promise<ArrayBuffer>((resolve, reject) => digests.set(index, { resolve, reject })),
      );
    }
    return track(
      entry,
      Promise.resolve(bytes(mode === 'known' ? options.knownHash : '0'.repeat(64))),
    );
  };
  crypto.randomUUID = () => {
    const entry = call('uuid', 'record');
    const value = nativeUuid();
    entry.state = 'resolved';
    return value;
  };

  let copyIndex = 0;
  const writeText = (text: string) => {
    const entry = call('copy', text);
    const index = copyIndex++;
    if (control.copyMode === 'native') {
      // 既存 clipboard は読まない。実 API の成功後にだけテスト自身の値を照合できる。
      return track(
        entry,
        nativeCopy ? nativeCopy(text) : Promise.reject(new Error('No clipboard')),
      );
    }
    if (control.copyMode === 'reject')
      return track(entry, Promise.reject(new Error('Test copy rejection')));
    if (control.copyMode === 'defer') {
      return track(
        entry,
        new Promise<void>((resolve, reject) => copies.set(index, { resolve, reject })),
      );
    }
    return track(entry, Promise.resolve());
  };
  // writeText だけを差し替える。native 確認時の readText は、書き込み成功後に限り呼び出す。
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText, readText: nativeClipboard?.readText.bind(nativeClipboard) },
  });

  function storageCall(
    method: StorageMethod,
    target: Storage,
    key: string,
    action: () => void | string | null,
  ) {
    if (target !== storage) return action();
    const entry = call(method, key);
    if (control.faults.includes(`${method}:${key}`)) {
      entry.state = 'rejected';
      throw new DOMException('Test storage rejection', 'QuotaExceededError');
    }
    const value = action();
    entry.state = 'resolved';
    return value;
  }
  Storage.prototype.getItem = function (key) {
    return storageCall('getItem', this, key, () => nativeGet.call(this, key)) as string | null;
  };
  Storage.prototype.setItem = function (key, value) {
    storageCall('setItem', this, key, () => nativeSet.call(this, key, value));
  };
  Storage.prototype.removeItem = function (key) {
    storageCall('removeItem', this, key, () => nativeRemove.call(this, key));
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      if (control.blockStorage)
        throw new DOMException('Test storage getter rejection', 'SecurityError');
      return storage;
    },
  });
}
