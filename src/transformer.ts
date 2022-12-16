import ts from "typescript";

function leading_comments(node: ts.Node, sf: ts.SourceFile): string[] {
   const declaration_file = node.getSourceFile() ?? sf;
   const raw = declaration_file.getFullText();
   const start = node.getFullStart();
   const ranges = ts.getLeadingCommentRanges(raw, start);
   return ranges ? ranges.map(({pos, end}) => raw.slice(pos, end).trim()) : [];
}

function get_declarations(s: ts.Symbol | undefined): ts.Declaration[] {
   if (!s) {
      return [];
   }
   if (!s.declarations) {
      return [];
   }
   return s.declarations;
}

class fd_trans implements ts.CustomTransformer {
   checker: ts.TypeChecker;

   constructor (
      protected program: ts.Program,
      protected ctx: ts.TransformationContext,
   )
   {
      this.checker = this.program.getTypeChecker();
   }

   transformBundle(bundle: ts.Bundle): ts.Bundle {
      return bundle;
   }

   transformSourceFile(src: ts.SourceFile): ts.SourceFile {
      return ts.visitEachChild(src, this.routing_visitor_factory(src), this.ctx);
   }

   routing_visitor_factory(src: ts.SourceFile): ts.Visitor {
      const routing_visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
         if (ts.isTypeAliasDeclaration(node)) {
            if (leading_comments(node, src).includes("//! foundatsion::bake")) {
               return this.baking_visitor(node);
            }
         } else if (ts.isTypeReferenceNode(node)) {
            const typ = this.checker.getTypeFromTypeNode(node);
            const origin = get_declarations(typ.aliasSymbol).filter(ts.isTypeAliasDeclaration);
            for (const tad of origin) {
               const comments = leading_comments(tad, src);
               if (comments.includes("//! foundatsion::newtype")) {
                  return this.ctx.factory.createKeywordTypeNode(
                     ts.SyntaxKind.UnknownKeyword
                  );
               }
               if (comments.includes("//! foundatsion::unwrap")) {
                  return node.typeArguments || node;
               }
            }
         }
         return ts.visitEachChild(node, routing_visitor, this.ctx);
      };

      return routing_visitor;
   }

   baking_visitor(ta: ts.TypeAliasDeclaration): ts.TypeAliasDeclaration {
      const type = this.checker.getTypeFromTypeNode(ta.type);
      const baked_typenode = this.checker.typeToTypeNode(
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

export function ts_transformer(program: ts.Program): ts.CustomTransformerFactory {
   return ctx => new fd_trans(program, ctx);
}
