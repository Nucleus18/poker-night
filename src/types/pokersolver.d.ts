declare module 'pokersolver' {
  export const Hand: {
    solve(cards: string[]): any;
    winners(hands: any[]): any[];
  };
}
