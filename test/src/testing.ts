import {F} from "@axel-hq/foundatsion";

export type uint = number & F.newtype<"uint">;
export type even = number & F.newtype<"even">;

type force_even<n extends number> =
   `${number}` extends `${n}`
      ? even
      : `${n}` extends `${string}.${string}`
         ? even
         : `${n}` extends `${number}${0 | 2 | 4 | 6 | 8}`
            ? unknown
            : even;

export function even<n extends number>(n: n & force_even<n>): n & even {
   return n as never;
}

export function div(a: even, b: even): uint {
   return (a / b) as never;
}

//! fddtsc::bake
export type baked = F.tt.merge<{a: 1} & {b: 2}>;
