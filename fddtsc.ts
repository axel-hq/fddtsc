#!/usr/bin/env node
import fs from "node:fs";
import ts from "typescript";
import url from "node:url";
import path from "node:path";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(`${__dirname}/package.json`, "utf8"));

let r; // reset
let c; // cyan
let m; // magenta
let y; // yellow
let b; // blue
let d; // dim

if (process.stdout.isTTY && process.stderr.isTTY) {
   r = "\x1b[0m";
   c = "\x1b[96m";
   m = "\x1b[95m";
   y = "\x1b[93m";
   b = "\x1b[94m";
   d = "\x1b[2m";
} else {
   r = "";
   c = "";
   m = "";
   y = "";
   b = "";
   d = "";
}

[r, c, m, y, b, d] satisfies string[];

const help =
   [ `${y}@axel-hq${r}/${m}fddtsc${r}@${meta.version}: foundatsion's d.ts generator`
   , ""
   , `${m}fddtsc${r} [${b}flag${r} [${c}arg${r}], ...]`
   , ""
   , `${b}--help, -h${r}`
   , "   Print this message."
   , ""
   , `${b}--project, -p${r} (${c}path${r})`
   , "   Use a different tsconfig.json file."
   , "   Either a directory containing tsconfig.json or a file."
   , ""
   , `${b}--outDir${r} (${c}path${r})`
   , "   Specify an output folder for all emitted files."
   , "   Note that declarationDir overrides this."
   , ""
   , `${b}--declarationDir${r} (${c}path${r})`
   , "   Specify the output directory for generated declaration files."
   , "",
   ].join("\n");

let project = "tsconfig.json";
let outDir;
let declarationDir;
let fatal = false;
let warn = false;

for (let i = 2; i < process.argv.length; i++) {
   const arg = process.argv[i];
   if (arg === "-h" || arg === "--help") {
      process.stdout.write(help);
      process.exit(0);
   }

   switch (arg) {
      case "-p":
      case "--project":
      case "--outDir":
      case "--declarationDir": break;
      default:
         warn = true;
         process.stderr.write(`${d}[fddtsc warn] unknown argument ${JSON.stringify(arg)}${r}.\n`);
         continue;
   }

   const arg2 = process.argv[++i];
   if (typeof arg2 !== "string") {
      process.stderr.write(`[fddtsc fatal] ${b}${arg}${r} expected a ${c}path${r}!\n`);
      fatal = true;
   } else switch (arg) {
      case "-p":
      case "--project":
         project = arg2;
         break;
      case "--outDir":
         outDir = arg2;
         break;
      case "--declarationDir":
         declarationDir = arg2;
         break;
   }
}

if (fatal || warn) {
   process.stderr.write(`${d}[fddtsc warn] run 'fddtsc --help' for usage info.${r}\n`);
}

if (fatal) {
   process.exit(0);
}

// Reading in the config file is actually such a pain in the ass.
// Here are the steps, roughly:
// 1. read the text in
// 2. parse the json with a special parser because comments and comma dangle
// 3. convert that object into the actual configuration format that typescript
//    uses because it's not actually the stuff in tsconfig.json.
if (fs.statSync(project).isDirectory()) {
   project = `${project}/tsconfig.json`;
}
const cfg_raw = fs.readFileSync(project, "utf8");
const try_parse_json = ts.parseConfigFileTextToJson(project, cfg_raw);

function print_diagnostics(diagnostics: readonly ts.Diagnostic[]) {
   for (const diag of diagnostics) {
      let message = "Error";
      if (diag.file && diag.start) {
         const {line, character: chr} = diag.file.getLineAndCharacterOfPosition(diag.start);
         message += ` ${diag.file.fileName} (${line + 1},${chr + 1})`;
      }
      message += ": " + ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      console.log(message);
   }
}

if (try_parse_json.error) {
   print_diagnostics([try_parse_json.error]);
   process.exit(try_parse_json.error.code);
}

const cfg_obj = try_parse_json.config;
const __ts_pcl = ts.parseJsonConfigFileContent(
   cfg_obj,
   ts.sys,
   path.dirname(project),
);

if (__ts_pcl.errors.length > 0) {
   print_diagnostics(__ts_pcl.errors);
   process.exit(1);
}

// time to set options that we either got from the command line or are going to
// force. it'd be pretty stupid if we didn't set declaration because that's what
// this entire script is supposed to generate.
if (outDir != null) {
   __ts_pcl.options.outDir = outDir;
}
if (declarationDir != null) {
   __ts_pcl.options.declarationDir = declarationDir;
}
delete __ts_pcl.options.tsBuildInfoFile; // this is like for incremental stuff
const prescribed: ts.CompilerOptions = {
   declaration: true,
   composite: false, // I have no idea what this is
   incremental: false, // this causes an issue if left true
   watch: false, // oh yeah I guess they added some kind of watching thing
};
Object.assign(__ts_pcl.options, prescribed);

const host = ts.createCompilerHost(
   __ts_pcl.options,
   true, // this means that node.parent will be set
);
const program = ts.createProgram(__ts_pcl.fileNames, __ts_pcl.options, host);
print_diagnostics(ts.getPreEmitDiagnostics(program));
const checker = program.getTypeChecker();

// alright I'm going to roughly explain how this works for whoever has to come
// along later to fix whatever unspeakable bugs are caused by Microsoft.
// This is a thingie that takes in a bunch of syntax nodes and spits out a bunch
// of syntax nodes and since it's a tree it's kinda recursive.
class CoreTran implements ts.CustomTransformer {
   constructor(protected ctx: ts.TransformationContext) {}
   transformBundle(bundle: ts.Bundle) {
      // I have a sinking suspicion that I should've figured out when this is
      // called and also tried to transform nodes inside of here.
      // If the scenario occurs that nothing is being transformed when you've
      // doing something related to bundling, this is probably it.
      // I don't really think typescript does any bundling but I could be wrong.
      return bundle;
   }
   unknown() {
      return this.ctx.factory.createKeywordTypeNode(
         ts.SyntaxKind.UnknownKeyword
      );
   }
   transformSourceFile(src: ts.SourceFile): ts.SourceFile {
      const comments_before = (node: ts.Node): string[] => {
         const file = node.getSourceFile() ?? src;
         const raw = file.getFullText();
         const start = node.getFullStart();
         const ranges = ts.getLeadingCommentRanges(raw, start);
         return ranges?.map(({pos, end}) => raw.slice(pos, end).trim()) ?? [];
      };
      const route = (node: ts.Node): ts.VisitResult<ts.Node> => {
         if (ts.isTypeAliasDeclaration(node)) {
            if (comments_before(node).includes("//! foundatsion::bake")) {
               return this.bake(node);
            }
         } else
         if (ts.isTypeReferenceNode(node)) {
            // this doesn't always work because sometimes the typescript
            // compiler eagerly evaluates the type at `node`.
            // it is still possible to get the source but I've decided that it's
            // more trouble than it's worth.
            // for now, if you're trying to !newtype or !unwrap some type alias
            // that's a simple type such as `number`, use `number & {}` to
            // prevent type interning.
            const typ = checker.getTypeFromTypeNode(node);
            const origin = typ.aliasSymbol?.declarations?.filter(ts.isTypeAliasDeclaration) ?? [];
            for (const tad of origin) {
               const comments = comments_before(tad);
               if (comments.includes("//! foundatsion::newtype")) {
                  return this.unknown();
               }
               if (comments.includes("//! foundatsion::unwrap")) {
                  return node.typeArguments || node;
               }
            }
         }
         return ts.visitEachChild(node, route, this.ctx);
      };
      // So this here is what kicks off the process of transforming the nodes.
      // There are a lot of different nodes which contain child nodes in a
      // variety of different fields.

      // You do not want to have a big switch to check if you're dealing with
      // x node or y node. Just let typescript call your function on every node
      // for you.

      // As you may notice, this function only visits the child nodes one layer
      // deep. To actually traverse the entire syntax tree, you must call this
      // recursively.

      // To begin the process of transforming stuff, we're going to first search
      // for our special comments and then decide what to do later.
      return ts.visitEachChild(src, route, this.ctx);
   }
   bake(ta: ts.TypeAliasDeclaration) {
      const type = checker.getTypeFromTypeNode(ta.type);
      const baked_typenode = checker.typeToTypeNode(
         type,
         undefined,
         0
         // these flags seem to cause the baking.
         // there is no real official documentation and I just kinda tried flags
         // until I got what I wanted.
         | ts.NodeBuilderFlags.NoTruncation
         | ts.NodeBuilderFlags.InTypeAlias
         | ts.NodeBuilderFlags.UseFullyQualifiedType
         | ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope
      );
      if (baked_typenode) {
         return this.ctx.factory.updateTypeAliasDeclaration(
            ta,
            ta.modifiers,
            ta.name,
            ta.typeParameters,
            baked_typenode,
         );
      } else {
         // I guess sometimes it can fail?
         // Again, no real documentation.
         return ta;
      }
   }
}

const l_sga = program.emit(
   undefined,
   undefined,
   undefined,
   true, // emitOnlyDtsFiles
   {afterDeclarations: [ctx => new CoreTran(ctx)]},
);

print_diagnostics(l_sga.diagnostics);
process.exit(l_sga.emitSkipped ? 1 : 0);
