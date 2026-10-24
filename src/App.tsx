import { GeneratorScreen } from './components/GeneratorScreen';
import { useColorGenerator } from './hooks/useColorGenerator';

/** UI は props のままに保ち、実際の生成・保存・clipboard の接続点をここに限定する。 */
export default function App() {
  const screen = useColorGenerator();
  return <GeneratorScreen {...screen} />;
}
