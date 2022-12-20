#!/usr/bin/env node
import fs from "fs";
import ts from "typescript";
import path from "path";

let tsconfig_location = process.argv[2];
if (tsconfig_location == null) {
   tsconfig_location = "tsconfig.json";
}
const config_text = fs.readFileSync(tsconfig_location, "utf8");
const json_parse_result = ts.parseConfigFileTextToJson(tsconfig_location, config_text);

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

if (json_parse_result.error != null) {
   print_diagnostics([json_parse_result.error]);
   process.exit(1);
}

const raw_obj = json_parse_result.config;
const __ts_pcl = ts.parseJsonConfigFileContent(
   raw_obj,
   ts.sys,
   path.dirname(tsconfig_location),
);

if (__ts_pcl.errors.length > 0) {
   print_diagnostics(__ts_pcl.errors);
   process.exit(1);
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
            if (comments_before(node).includes("//! fddtsc::bake")) {
               return this.bake(node);
            }
         } else
         if (ts.isTypeReferenceNode(node)) {
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

// Report errors
print_diagnostics(l_sga.diagnostics);

process.exit(l_sga.emitSkipped ? 1 : 0);
