import fs from "fs";
import ts from "typescript";
import {dirname} from "path";

const tsconfig_location = process.argv[2];
if (tsconfig_location == null) {
   throw new Error("need argument for tsconfig.json");
}
const config_text = fs.readFileSync(tsconfig_location, "utf8");
/**
 * This is just JSON.parse with comments.
 * It wants the filename too so that it can generate diagnostics.
 */
const json_parse_result = ts.parseConfigFileTextToJson(tsconfig_location, config_text);

function print_diagnostics(diagnostics: readonly ts.Diagnostic[]) {
   for (const diag of diagnostics) {
      let message = "Error";
      if (diag.file && diag.start) {
         let {line, character} = diag.file.getLineAndCharacterOfPosition(diag.start);
         message += ` ${diag.file.fileName} (${line + 1},${character + 1})`;
      }
      message += ": " + ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      console.log(message);
   }
}

if (json_parse_result.error != null) {
   print_diagnostics([json_parse_result.error]);
   process.exit(1);
}

const config_obj = json_parse_result.config;
delete config_obj.tsBuildInfoFile;
const prescribed: ts.CompilerOptions = {
   declaration: true,
   emitDeclarationOnly: true,
   composite: false,
   incremental: false,
   watch: false,
};
Object.assign(config_obj, prescribed);

const __ts_pcl = ts.parseJsonConfigFileContent(
   config_obj,
   ts.sys,
   dirname(tsconfig_location),
);

if (__ts_pcl.errors.length > 0) {
   print_diagnostics(__ts_pcl.errors);
   process.exit(1);
}

const host = ts.createCompilerHost(__ts_pcl.options, true);
const program = ts.createProgram(__ts_pcl.fileNames, __ts_pcl.options, host);
print_diagnostics(ts.getPreEmitDiagnostics(program));
const checker = program.getTypeChecker();

class tst implements ts.CustomTransformer {
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
      const routing_visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
         if (ts.isTypeAliasDeclaration(node)) {
            if (comments_before(node).includes("//! fddtsc::bake")) {
               return this.bake(node);
            }
         } else

         if (ts.isTypeReferenceNode(node)) {
            const typ = checker.getTypeFromTypeNode(node);
            const origin = typ.aliasSymbol?.declarations?.filter(ts.isTypeAliasDeclaration) ?? [];
            for (const tad of origin) {
               const comments = comments_before(tad);
               if (comments.includes("//! fddtsc::newtype")) {
                  return this.unknown();
               }
               if (comments.includes("//! fddtsc::unwrap")) {
                  return node.typeArguments || node;
               }
            }
         }

         return ts.visitEachChild(node, routing_visitor, this.ctx);
      };
      return ts.visitEachChild(src, routing_visitor, this.ctx);
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

const lsga = program.emit(
   undefined,
   undefined,
   undefined,
   undefined,
   {afterDeclarations: [ctx => new tst(ctx)]},
);

// Report errors
print_diagnostics(lsga.diagnostics);

// Return code
let exitCode = lsga.emitSkipped ? 1 : 0;
process.exit(exitCode);
