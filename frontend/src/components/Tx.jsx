import { useT } from '../i18n';

/** Static text that should follow the chosen language: <Tx>Back to the list</Tx>. Anything without a translation stays as written. */
export default function Tx({ children }) {
  const { t } = useT();
  return typeof children === 'string' ? t(children) : children;
}
