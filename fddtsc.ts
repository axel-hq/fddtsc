#!/usr/bin/env node
import fs from "node:fs";
import ts from "typescript";
import url from "node:url";
import path from "node:path";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const meta = JSON.parse(fs.readFileSync(`${__dirname}/package.json`, "utf8"));
const help =
   [ `\x1b[93m@axel-hq\x1b[0m/\x1b[95mfddtsc\x1b[0m@${meta.version}: foundatsion's d.ts generator`
   , ""
   , "\x1b[95mfddtsc\x1b[0m [\x1b[94mflag\x1b[0m [\x1b[96marg\x1b[0m], ...]"
   , ""
   , "\x1b[94m--help, -h\x1b[0m"
   , "   Print this message."
   , ""
   , "\x1b[94m--project, -p\x1b[0m (\x1b[96mpath\x1b[0m)"
   , "   Use a different tsconfig.json file."
   , "   Either a directory containing tsconfig.json or a file."
   , ""
   , "\x1b[94m--outDir\x1b[0m (\x1b[96mpath\x1b[0m)"
   , "   Specify an output folder for all emitted files."
   , "   Note that declarationDir overrides this."
   , ""
   , "\x1b[94m--declarationDir\x1b[0m (\x1b[96mpath\x1b[0m)"
   , "   Specify the output directory for generated declaration files."
   , "",
   ].join("\n");

let project = "tsconfig.json";
let outDir;
let declarationDir;

for (let i = 2; i < process.argv.length; i++) {
   const arg = process.argv[i];
   switch (arg) {
      case "--help": case "-h":
         process.stdout.write(help);
         process.exit(0);
      case "--project": case "-p": {
         const arg2 = process.argv[i + 1];
         if (typeof arg2 !== "string") {
            process.stderr.write(`${arg} expected an argument!\n`);
            process.exit(1);
         }
         i++;
         project = arg2;
         break;
      }
      case "--outDir": {
         const arg2 = process.argv[i + 1];
         if (typeof arg2 !== "string") {
            process.stderr.write(`${arg} expected an argument!\n`);
            process.exit(1);
         }
         outDir = arg2;
         i++;
         break;
      }
      case "--declarationDir": {
         const arg2 = process.argv[i + 1];
         if (typeof arg2 !== "string") {
            process.stderr.write(`${arg} expected an argument!\n`);
            process.exit(1);
         }
         declarationDir = arg2;
         i++;
         break;
      }
      default:
         process.stderr.write(`[fddtsc warn] ignored argument ${i}: ${JSON.stringify(arg)}\n`);
   }
}

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

if (outDir != null) {
   __ts_pcl.options.outDir = outDir;
}
if (declarationDir != null) {
   __ts_pcl.options.declarationDir = declarationDir;
}

delete __ts_pcl.options.tsBuildInfoFile;
const prescribed: ts.CompilerOptions = {
   declaration: true,
   composite: false,
   incremental: false,
   watch: false,
};
Object.assign(__ts_pcl.options, prescribed);

const host = ts.createCompilerHost(__ts_pcl.options, true);
const program = ts.createProgram(__ts_pcl.fileNames, __ts_pcl.options, host);
print_diagnostics(ts.getPreEmitDiagnostics(program));
const checker = program.getTypeChecker();

class CoreTran implements ts.CustomTransformer {
   constructor(protected ctx: ts.TransformationContext) {}
   transformBundle(bundle: ts.Bundle) {
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
      return ts.visitEachChild(src, route, this.ctx);
   }
   bake(ta: ts.TypeAliasDeclaration) {
      const type = checker.getTypeFromTypeNode(ta.type);
      const baked_typenode = checker.typeToTypeNode(
         type,
         undefined,
         0
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
