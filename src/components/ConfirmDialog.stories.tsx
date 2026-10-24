import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { ConfirmDialog } from './ConfirmDialog';
import { confirmations } from './story-fixtures';

/** 表示用ラッパーだけの引数。保存失敗や削除処理を実装せず、フォーカス復帰条件を再現する。 */
type DialogStoryArgs = ComponentProps<typeof ConfirmDialog> & { removeTriggerOnConfirm: boolean };

function DialogPreview({ removeTriggerOnConfirm, ...args }: DialogStoryArgs) {
  // ここで持つ state は UI の開閉と確認用の起点だけ。履歴・お気に入りのデータは扱わない。
  const [open, setOpen] = useState(false);
  const [triggerRemoved, setTriggerRemoved] = useState(false);
  const fallbackRef = useRef<HTMLHeadingElement>(null);
  return (
    <div className="p-4 font-sans text-slate-900">
      <h2 ref={fallbackRef} tabIndex={-1} className="mb-4 text-lg font-semibold">
        Confirmation preview
      </h2>
      {!triggerRemoved ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          Open confirmation
        </button>
      ) : (
        <p>The trigger was removed for this focus demonstration.</p>
      )}
      <ConfirmDialog
        {...args}
        open={open}
        fallbackFocusRef={fallbackRef}
        onCancel={() => {
          args.onCancel();
          setOpen(false);
        }}
        onConfirm={() => {
          args.onConfirm();
          if (removeTriggerOnConfirm) setTriggerRemoved(true);
          setOpen(false);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  render: DialogPreview,
  args: {
    ...confirmations.clear,
    open: false,
    removeTriggerOnConfirm: false,
    // action を直接 args に置かず、自動 spy と手動のログが二重になることを避ける。
    onConfirm: () => {
      action('confirmation-accepted')();
    },
    onCancel: () => {
      action('confirmation-cancelled')();
    },
  },
  argTypes: {
    open: { control: false },
    fallbackFocusRef: { control: false },
    onConfirm: { control: false },
    onCancel: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Open confirmation で開き、Cancel 初期フォーカス・Escape・背景・確定・復帰先を確認する。Docs の表示だけで複数のモーダルを自動的に開かない。Actions は保存結果ではなく確認の選択を記録する。',
      },
    },
  },
} satisfies Meta<DialogStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ClearHistory: Story = {};
export const ClearTabHistory: Story = { args: confirmations.clearTab };
export const RemoveFavorite: Story = { args: confirmations.remove };
export const ResetHistory: Story = { args: confirmations.resetHistory };
export const ResetFavorites: Story = { args: confirmations.resetFavorites };
// 確定で起点だけを消す。次のフォーカスが body に落ちず、見出しへ戻ることを確認する。
export const OriginRemoved: Story = {
  args: { ...confirmations.remove, removeTriggerOnConfirm: true },
};
