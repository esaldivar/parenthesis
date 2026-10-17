// Lets specs import a stylesheet's source text (`with { loader: 'text' }`), e.g. to check design tokens.
declare module '*.scss' {
  const source: string;
  export default source;
}
