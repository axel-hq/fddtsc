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
export type so = "shouldn't this be {}?";
export type baked = "!dlroW ,olleH";
```

<sub>for Reasons We Do Not Fully Understand, neither newtype nor unwrap work all
the time<sub>

## for developers

1. `make build`
2. `make install`
3. `make test`
