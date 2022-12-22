# fddtsc

*FounDatsion Declaration TypeScript Compiler*

## usage

`fddtsc [--help] [--project foo/bar/tsconfig.json] [--declarationDir bin/dts]`

## transform calls //!

Leading comments (comments directly above a type) trigger type transforms.

- `foundatsion::newtype`: every reference to this type is replaced with `unknown`.
- `foundatsion::unwrap`: every reference to this type is replaced with it's first type argument.
- `foundatsion::bake`: this type's simplification is baked into the output.

```ts
// @file example.ts

//! foundatsion::unwrap
type bar<baz> = never;
type reverse_string<s extends string> =
   s extends `${infer head}${infer tail}`
      ? `${reverse_string<tail>}${head}`
      : "";

export type so = bar<"shouldn't this be never?">;
//! foundatsion::bake
export type baked = reverse_string<"Hello, World!">;
```

```ts
// @file example.d.ts
export type so = "shouldn't this be never?";
export type baked = "!dlroW ,olleH";
```

<sub>for <a href="https://github.com/axel-hq/fddtsc/blob/3bcb44a0fb06b7a7189d3174af442daaf989acb7/fddtsc.ts#L156">Reasons We Do Not Fully Understand</a>, neither newtype nor unwrap work all
the time<sub>

## for developers

1. `make build`
2. `make install`
3. `make test`
