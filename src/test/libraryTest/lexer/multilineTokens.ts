// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import { Language } from "../../..";
import {
    AbridgedComments,
    AbridgedLineTokens,
    AbridgedSnapshot,
    AbridgedTokens,
    assertAbridgedSnapshotMatch,
    assertLineTokenMatch,
    assertSnapshotAbridgedComments,
    assertSnapshotAbridgedTokens,
} from "./common";

const LINE_TERMINATOR: string = "\n";

describe(`Lexer`, () => {
    describe(`MultilineTokens Abridged LineToken`, () => {
        describe(`MultilineComment`, () => {
            it(`/**/`, () => {
                const text: string = `/**/`;
                const expected: AbridgedLineTokens = [[Language.LineTokenKind.MultilineComment, `/**/`]];
                assertLineTokenMatch(text, expected, true);
            });

            it(`/*/*/`, () => {
                const text: string = `/*/*/`;
                const expected: AbridgedLineTokens = [[Language.LineTokenKind.MultilineComment, `/*/*/`]];
                assertLineTokenMatch(text, expected, true);
            });

            it(`/*\\n*/`, () => {
                const text: string = `/*${LINE_TERMINATOR}*/`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.MultilineCommentStart, `/*`],
                    [Language.LineTokenKind.MultilineCommentEnd, `*/`],
                ];
                assertLineTokenMatch(text, expected, true);
            });

            it(`/*\\nfoobar\\n*/`, () => {
                const text: string = `/*${LINE_TERMINATOR}foobar${LINE_TERMINATOR}*/`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.MultilineCommentStart, `/*`],
                    [Language.LineTokenKind.MultilineCommentContent, `foobar`],
                    [Language.LineTokenKind.MultilineCommentEnd, `*/`],
                ];
                assertLineTokenMatch(text, expected, true);
            });

            it(`/*\\n\nfoobar\\n\\n*/`, () => {
                const text: string = `/*${LINE_TERMINATOR}${LINE_TERMINATOR}foobar${LINE_TERMINATOR}${LINE_TERMINATOR}*/`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.MultilineCommentStart, `/*`],
                    [Language.LineTokenKind.MultilineCommentContent, `foobar`],
                    [Language.LineTokenKind.MultilineCommentEnd, `*/`],
                ];
                assertLineTokenMatch(text, expected, true);
            });
        });

        describe(`TextLiteral`, () => {
            it(`""`, () => {
                const text: string = `""`;
                const expected: AbridgedLineTokens = [[Language.LineTokenKind.TextLiteral, `""`]];
                assertLineTokenMatch(text, expected, true);
            });

            it(`"\\n"`, () => {
                const text: string = `"${LINE_TERMINATOR}"`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.TextLiteralStart, `"`],
                    [Language.LineTokenKind.TextLiteralEnd, `"`],
                ];
                assertLineTokenMatch(text, expected, true);
            });

            it(`"\\nfoobar\\n"`, () => {
                const text: string = `"${LINE_TERMINATOR}foobar${LINE_TERMINATOR}"`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.TextLiteralStart, `"`],
                    [Language.LineTokenKind.TextLiteralContent, `foobar`],
                    [Language.LineTokenKind.TextLiteralEnd, `"`],
                ];
                assertLineTokenMatch(text, expected, true);
            });
        });

        describe(`QuotedIdentifer`, () => {
            it(`""`, () => {
                const text: string = `#""`;
                const expected: AbridgedLineTokens = [[Language.LineTokenKind.Identifier, `#""`]];
                assertLineTokenMatch(text, expected, true);
            });

            it(`#"\\n"`, () => {
                const text: string = `#"${LINE_TERMINATOR}"`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.QuotedIdentifierStart, `#"`],
                    [Language.LineTokenKind.QuotedIdentifierEnd, `"`],
                ];
                assertLineTokenMatch(text, expected, true);
            });

            it(`#"\\nfoobar\\n"`, () => {
                const text: string = `#"${LINE_TERMINATOR}foobar${LINE_TERMINATOR}"`;
                const expected: AbridgedLineTokens = [
                    [Language.LineTokenKind.QuotedIdentifierStart, `#"`],
                    [Language.LineTokenKind.QuotedIdentifierContent, `foobar`],
                    [Language.LineTokenKind.QuotedIdentifierEnd, `"`],
                ];
                assertLineTokenMatch(text, expected, true);
            });
        });
    });

    describe(`MultilineTokens Abridged LexerSnapshot`, () => {
        describe(`MultilineComment`, () => {
            it(`/**/`, () => {
                const text: string = `/**/`;
                const expected: AbridgedComments = [[Language.CommentKind.Multiline, `/**/`]];
                assertSnapshotAbridgedComments(text, expected, true);
            });

            it(`/* */`, () => {
                const text: string = `/* */`;
                const expected: AbridgedComments = [[Language.CommentKind.Multiline, `/* */`]];
                assertSnapshotAbridgedComments(text, expected, true);
            });

            it(`/* X */`, () => {
                const text: string = `/* X */`;
                const expected: AbridgedComments = [[Language.CommentKind.Multiline, `/* X */`]];
                assertSnapshotAbridgedComments(text, expected, true);
            });

            it(`/*X\\nX\\nX*/`, () => {
                const text: string = `/*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/`;
                const expected: AbridgedComments = [
                    [Language.CommentKind.Multiline, `/*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/`],
                ];
                assertSnapshotAbridgedComments(text, expected, true);
            });

            it(`abc /*X\\nX\\nX*/`, () => {
                const text: string = `abc /*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/`;
                const expected: AbridgedSnapshot = {
                    comments: [[Language.CommentKind.Multiline, `/*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/`]],
                    tokens: [[Language.TokenKind.Identifier, `abc`]],
                };
                assertAbridgedSnapshotMatch(text, expected, true);
            });

            it(`/*X\\nX\\nX*/ abc`, () => {
                const text: string = `/*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/ abc`;
                const expected: AbridgedSnapshot = {
                    tokens: [[Language.TokenKind.Identifier, `abc`]],
                    comments: [[Language.CommentKind.Multiline, `/*X${LINE_TERMINATOR}X${LINE_TERMINATOR}X*/`]],
                };
                assertAbridgedSnapshotMatch(text, expected, true);
            });
        });

        describe(`TextLiteral`, () => {
            it(`"X"`, () => {
                const text: string = `"X"`;
                const expected: AbridgedTokens = [[Language.TokenKind.TextLiteral, `"X"`]];
                assertSnapshotAbridgedTokens(text, expected, true);
            });

            it(`"X\\nX\\nX"`, () => {
                const text: string = `"X${LINE_TERMINATOR}X${LINE_TERMINATOR}X"`;
                const expected: AbridgedTokens = [
                    [Language.TokenKind.TextLiteral, `"X${LINE_TERMINATOR}X${LINE_TERMINATOR}X"`],
                ];
                assertSnapshotAbridgedTokens(text, expected, true);
            });

            it(`abc "X\\nX\\nX"`, () => {
                const text: string = `abc "X${LINE_TERMINATOR}X${LINE_TERMINATOR}X"`;
                const expected: AbridgedTokens = [
                    [Language.TokenKind.Identifier, `abc`],
                    [Language.TokenKind.TextLiteral, `"X${LINE_TERMINATOR}X${LINE_TERMINATOR}X"`],
                ];
                assertSnapshotAbridgedTokens(text, expected, true);
            });

            it(`"X\\nX\\nX" abc`, () => {
                const text: string = `"X${LINE_TERMINATOR}X${LINE_TERMINATOR}X" abc`;
                const expected: AbridgedTokens = [
                    [Language.TokenKind.TextLiteral, `"X${LINE_TERMINATOR}X${LINE_TERMINATOR}X"`],
                    [Language.TokenKind.Identifier, `abc`],
                ];
                assertSnapshotAbridgedTokens(text, expected, true);
            });
        });
    });
});
