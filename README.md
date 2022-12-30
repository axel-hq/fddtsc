# fddtsc

<i><u>f</u>oun<u>d</u>atsion <u>d</u>eclaration <u>t</u>ype<u>s</u>cript file <u>c</u>ompiler</i>

## usage

<pre><code style="color: khaki">@axel-hq</code><code>/</code><code style="color: violet">fddtsc</code><code>: foundatsion's d.ts generator

<code style="color: violet">fddtsc</code> [</code><code style="color: skyblue">flag</code><code> [</code><code style="color: turquoise">arg</code><code>], ...]

</code><code style="color: skyblue">-help, -h</code><code>
   Print this message.

</code><code style="color: skyblue">--project, -p</code><code> (</code><code style="color: turquoise">path</code><code>)
   Use a different tsconfig.json file.
   Either a directory containing tsconfig.json or a file.

</code><code style="color: skyblue">--outDir</code><code> (</code><code style="color: turquoise">path</code><code>)
   Specify an output folder for all emitted files.
   Note that declarationDir overrides this.

</code><code style="color: skyblue">--declarationDir</code><code> (</code><code style="color: turquoise">path</code><code>)
   Specify the output directory for generated declaration files.
</code></pre>

## ffaq (fake frequently asked questions)

<details open>
   <summary>Who is this for?</summary>
   Anyone that uses
   <a href="https://www.npmjs.com/package/@axel-hq/foundatsion">@axel-hq/foundatsion</a>
   who plans to publish a library that would expose newtypes through d.ts files.
</details>

<details open>
   <summary>What does it do?</summary>
   Imagine you wanted to expose a method like <code>add1(a: F.uint): F.uint)`</code>.
   Without some special compiler magic, you'd have to create a wrapped <code>add1</code>
   which took numbers instead of foundatsion types; foundatsion types are hard
   to consume and create for non-foundatsion users.

   This, here, is the compiler magic that makes newtypes disappear within d.ts
   files.
</details>

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

1. `make install`
2. `make build`
3. `make install` (again to install what you just built into the test)
4. `make test`
