import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { ColorCode } from './ColorCode';

// satisfies は props と args の対応を検査しつつ、StoryObj 用の具体的な型情報を保持する。
const meta = {
  title: 'Components/ColorCode',
  component: ColorCode,
  args: {
    label: 'HEX',
    value: '#1D89E2',
    disabled: false,
    onCopy: (value) => {
      action('copy-requested')(value);
    },
  },
  argTypes: {
    label: { control: 'select', options: ['HEX', 'RGB', 'HSL'] },
    onCopy: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          '表示値をコピー要求として通知する。Actions に値を記録するだけで、clipboard へは書き込まない。',
      },
    },
  },
} satisfies Meta<typeof ColorCode>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hex: Story = {};
export const Rgb: Story = { args: { label: 'RGB', value: 'rgb(29 137 226)' } };
export const Hsl: Story = { args: { label: 'HSL', value: 'hsl(207 77% 50%)' } };
// 無効状態では Actions に要求が記録されないことを、実際の操作で確認する。
export const Disabled: Story = { args: { disabled: true } };
