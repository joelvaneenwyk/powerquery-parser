// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CommonError, Option, Result, ResultKind, StringHelpers } from "../common";
import { CommentKind, LineComment, MultilineComment, TComment } from "./comment";
import * as LexerError from "./error";
import * as Lexer from "./lexer";
import { IToken, LineTokenKind, Token, TokenKind, TokenPosition } from "./token";

export type TriedLexerSnapshot = Result<LexerSnapshot, LexerError.TLexerError>;

export class LexerSnapshot {
    constructor(
        public readonly text: string,
        public readonly tokens: ReadonlyArray<Token>,
        public readonly comments: ReadonlyArray<TComment>,
        public readonly lineTerminators: ReadonlyArray<LineTerminator>,
    ) {}

    public static tryFrom(state: Lexer.State): Result<LexerSnapshot, LexerError.TLexerError> {
        try {
            return {
                kind: ResultKind.Ok,
                value: LexerSnapshot.factory(state),
            };
        } catch (e) {
            let error: LexerError.TLexerError;
            if (LexerError.isTInnerLexerError(e)) {
                error = new LexerError.LexerError(e);
            } else {
                error = CommonError.ensureCommonError(e);
            }
            return {
                kind: ResultKind.Err,
                error,
            };
        }
    }

    public static graphemePositionStartFrom(
        text: string,
        lineTerminators: ReadonlyArray<LineTerminator>,
        flatLineToken: Token | FlatLineToken,
    ): StringHelpers.GraphemePosition {
        const positionStart: TokenPosition = flatLineToken.positionStart;
        const positionEnd: TokenPosition = flatLineToken.positionEnd;

        let substringPositionStart: number = 0;
        let substringPositionEnd: number = text.length;
        for (const lineTerminator of lineTerminators) {
            if (lineTerminator.codeUnit < positionStart.codeUnit) {
                substringPositionStart = lineTerminator.codeUnit + lineTerminator.text.length;
            }
            if (lineTerminator.codeUnit >= positionEnd.codeUnit) {
                substringPositionEnd = lineTerminator.codeUnit + lineTerminator.text.length;
                break;
            }
        }

        return StringHelpers.graphemePositionFrom(
            text.substring(substringPositionStart, substringPositionEnd),
            positionStart.lineCodeUnit,
            positionStart.lineNumber,
            positionEnd.codeUnit,
        );
    }

    public graphemePositionStartFrom(token: Token): StringHelpers.GraphemePosition {
        return LexerSnapshot.graphemePositionStartFrom(this.text, this.lineTerminators, token);
    }

    public columnNumberStartFrom(token: Token): number {
        return this.graphemePositionStartFrom(token).columnNumber;
    }

    private static factory(state: Lexer.State): LexerSnapshot {
        // class properties
        const tokens: Token[] = [];
        const comments: TComment[] = [];
        const flattenedLines: FlattenedLines = flattenLineTokens(state);
        const flatTokens: ReadonlyArray<FlatLineToken> = flattenedLines.flatLineTokens;
        const numFlatTokens: number = flatTokens.length;
        const text: string = flattenedLines.text;

        let flatIndex: number = 0;
        while (flatIndex < numFlatTokens) {
            const flatToken: FlatLineToken = flatTokens[flatIndex];

            switch (flatToken.kind) {
                case LineTokenKind.LineComment:
                    comments.push(readLineComment(flatToken));
                    break;

                case LineTokenKind.MultilineComment:
                    comments.push(readSingleLineMultilineComment(flatToken));
                    break;

                case LineTokenKind.MultilineCommentStart: {
                    const concatenatedTokenRead: ConcatenatedCommentRead = readMultilineComment(
                        flattenedLines,
                        flatToken,
                    );
                    comments.push(concatenatedTokenRead.comment);
                    flatIndex = concatenatedTokenRead.flatIndexEnd;
                    break;
                }

                case LineTokenKind.QuotedIdentifierStart: {
                    const concatenatedTokenRead: ConcatenatedTokenRead = readQuotedIdentifier(
                        flattenedLines,
                        flatToken,
                    );
                    tokens.push(concatenatedTokenRead.token);
                    flatIndex = concatenatedTokenRead.flatIndexEnd;
                    break;
                }

                case LineTokenKind.StringLiteralStart: {
                    const concatenatedTokenRead: ConcatenatedTokenRead = readStringLiteral(flattenedLines, flatToken);
                    tokens.push(concatenatedTokenRead.token);
                    flatIndex = concatenatedTokenRead.flatIndexEnd;
                    break;
                }

                default:
                    // UNSAFE MARKER
                    //
                    // Purpose of code block:
                    //      Translate LineTokenKind to LineToken.
                    //
                    // Why are you trying to avoid a safer approach?
                    //      A proper mapping would require a switch statement, one case per kind in LineNodeKind
                    //
                    // Why is it safe?
                    //      Almost all of LineTokenKind and TokenKind have a 1-to-1 mapping.
                    //      The edge cases (multiline tokens) have already been taken care of above.
                    //      set(remaining variants of LineTokenKind) === set(LineKind)
                    const positionStart: TokenPosition = flatToken.positionStart;
                    const positionEnd: TokenPosition = flatToken.positionEnd;
                    tokens.push({
                        kind: (flatToken.kind as unknown) as TokenKind,
                        data: flatToken.data,
                        positionStart,
                        positionEnd,
                    });
            }

            flatIndex += 1;
        }

        return new LexerSnapshot(text, tokens, comments, flattenedLines.lineTerminators);
    }
}

function readLineComment(flatToken: FlatLineToken): LineComment {
    const positionStart: TokenPosition = flatToken.positionStart;
    const positionEnd: TokenPosition = flatToken.positionEnd;

    return {
        kind: CommentKind.Line,
        data: flatToken.data,
        containsNewline: true,
        positionStart,
        positionEnd,
    };
}

// a multiline comment that spans a single line
function readSingleLineMultilineComment(flatToken: FlatLineToken): MultilineComment {
    const positionStart: TokenPosition = flatToken.positionStart;
    const positionEnd: TokenPosition = flatToken.positionEnd;

    return {
        kind: CommentKind.Multiline,
        data: flatToken.data,
        containsNewline: positionStart.lineNumber !== positionEnd.lineNumber,
        positionStart,
        positionEnd,
    };
}

function readMultilineComment(flattenedLines: FlattenedLines, tokenStart: FlatLineToken): ConcatenatedCommentRead {
    const collection: FlatLineCollection = collectWhileContent(
        flattenedLines.flatLineTokens,
        tokenStart,
        LineTokenKind.MultilineCommentContent,
    );
    const maybeTokenEnd: Option<FlatLineToken> = collection.maybeTokenEnd;
    if (!maybeTokenEnd) {
        throw new LexerError.UnterminatedMultilineTokenError(
            LexerSnapshot.graphemePositionStartFrom(flattenedLines.text, flattenedLines.lineTerminators, tokenStart),
            LexerError.UnterminatedMultilineTokenKind.MultilineComment,
        );
    } else if (maybeTokenEnd.kind !== LineTokenKind.MultilineCommentEnd) {
        const details: {} = { foundTokenEnd: maybeTokenEnd };
        const message: string = "once a multiline token starts it should either reach a paired end token, or eof";
        throw new CommonError.InvariantError(message, details);
    } else {
        const tokenEnd: FlatLineToken = maybeTokenEnd;
        const positionStart: TokenPosition = tokenStart.positionStart;
        const positionEnd: TokenPosition = tokenEnd.positionEnd;

        return {
            comment: {
                kind: CommentKind.Multiline,
                data: flattenedLines.text.substring(positionStart.codeUnit, positionEnd.codeUnit),
                containsNewline: positionStart.lineNumber !== positionEnd.lineNumber,
                positionStart,
                positionEnd,
            },
            flatIndexEnd: tokenEnd.flatIndex,
        };
    }
}

function readQuotedIdentifier(flattenedLines: FlattenedLines, tokenStart: FlatLineToken): ConcatenatedTokenRead {
    const collection: FlatLineCollection = collectWhileContent(
        flattenedLines.flatLineTokens,
        tokenStart,
        LineTokenKind.QuotedIdentifierContent,
    );
    const maybeTokenEnd: Option<FlatLineToken> = collection.maybeTokenEnd;
    if (!maybeTokenEnd) {
        throw new LexerError.UnterminatedMultilineTokenError(
            LexerSnapshot.graphemePositionStartFrom(flattenedLines.text, flattenedLines.lineTerminators, tokenStart),
            LexerError.UnterminatedMultilineTokenKind.QuotedIdentifier,
        );
    } else if (maybeTokenEnd.kind !== LineTokenKind.QuotedIdentifierEnd) {
        const details: {} = { foundTokenEnd: maybeTokenEnd };
        const message: string = "once a multiline token starts it should either reach a paired end token, or eof";
        throw new CommonError.InvariantError(message, details);
    } else {
        const tokenEnd: FlatLineToken = maybeTokenEnd;
        const positionStart: TokenPosition = tokenStart.positionStart;
        const positionEnd: TokenPosition = tokenEnd.positionEnd;

        return {
            token: {
                kind: TokenKind.Identifier,
                data: flattenedLines.text.substring(positionStart.codeUnit, positionEnd.codeUnit),
                positionStart,
                positionEnd,
            },
            flatIndexEnd: tokenEnd.flatIndex,
        };
    }
}

function readStringLiteral(flattenedLines: FlattenedLines, tokenStart: FlatLineToken): ConcatenatedTokenRead {
    const collection: FlatLineCollection = collectWhileContent(
        flattenedLines.flatLineTokens,
        tokenStart,
        LineTokenKind.StringLiteralContent,
    );
    const maybeTokenEnd: Option<FlatLineToken> = collection.maybeTokenEnd;
    if (!maybeTokenEnd) {
        throw new LexerError.UnterminatedMultilineTokenError(
            LexerSnapshot.graphemePositionStartFrom(flattenedLines.text, flattenedLines.lineTerminators, tokenStart),
            LexerError.UnterminatedMultilineTokenKind.String,
        );
    } else if (maybeTokenEnd.kind !== LineTokenKind.StringLiteralEnd) {
        const details: {} = { foundTokenEnd: maybeTokenEnd };
        const message: string = "once a multiline token starts it should either reach a paired end token, or eof";
        throw new CommonError.InvariantError(message, details);
    } else {
        const tokenEnd: FlatLineToken = maybeTokenEnd;
        const positionStart: TokenPosition = tokenStart.positionStart;
        const positionEnd: TokenPosition = tokenEnd.positionEnd;

        return {
            token: {
                kind: TokenKind.StringLiteral,
                data: flattenedLines.text.substring(positionStart.codeUnit, positionEnd.codeUnit),
                positionStart,
                positionEnd,
            },
            flatIndexEnd: tokenEnd.flatIndex,
        };
    }
}

function collectWhileContent<KindVariant>(
    flatTokens: ReadonlyArray<FlatLineToken>,
    tokenStart: FlatLineToken,
    contentKind: KindVariant & LineTokenKind,
): FlatLineCollection {
    const collectedTokens: FlatLineToken[] = [];
    const numTokens: number = flatTokens.length;

    let flatIndex: number = tokenStart.flatIndex + 1;
    while (flatIndex < numTokens) {
        const token: FlatLineToken = flatTokens[flatIndex];
        if (token.kind !== contentKind) {
            break;
        }

        collectedTokens.push(token);
        flatIndex += 1;
    }

    return {
        tokenStart,
        collectedTokens: collectedTokens,
        maybeTokenEnd: flatTokens[flatIndex],
    };
}

function flattenLineTokens(state: Lexer.State): FlattenedLines {
    const lines: ReadonlyArray<Lexer.TLine> = state.lines;
    const lineTerminators: LineTerminator[] = [];
    const numLines: number = lines.length;

    let text: string = "";
    const flatLineTokens: FlatLineToken[] = [];

    let lineTextOffset: number = 0;
    let flatIndex: number = 0;

    for (let lineNumber: number = 0; lineNumber < numLines; lineNumber += 1) {
        const line: Lexer.TLine = lines[lineNumber];

        text += line.text;
        if (lineNumber !== numLines - 1) {
            text += line.lineTerminator;
        }

        for (const lineToken of line.tokens) {
            const linePositionStart: number = lineToken.positionStart;
            const linePositionEnd: number = lineToken.positionEnd;

            flatLineTokens.push({
                kind: lineToken.kind,
                data: lineToken.data,
                positionStart: {
                    codeUnit: lineTextOffset + linePositionStart,
                    lineCodeUnit: linePositionStart,
                    lineNumber,
                },
                positionEnd: {
                    codeUnit: lineTextOffset + linePositionEnd,
                    lineCodeUnit: linePositionEnd,
                    lineNumber,
                },
                flatIndex,
            });

            flatIndex += 1;
        }

        const lineTerminatorCodeUnit: number = lineTextOffset + line.text.length;
        lineTerminators.push({
            codeUnit: lineTerminatorCodeUnit,
            text: line.lineTerminator,
        });
        lineTextOffset = lineTerminatorCodeUnit + line.lineTerminator.length;
    }

    return {
        text,
        lineTerminators,
        flatLineTokens,
    };
}

interface FlattenedLines {
    text: string;
    lineTerminators: ReadonlyArray<LineTerminator>;
    flatLineTokens: ReadonlyArray<FlatLineToken>;
}

interface ConcatenatedCommentRead {
    readonly comment: TComment;
    readonly flatIndexEnd: number;
}

interface ConcatenatedTokenRead {
    readonly token: Token;
    readonly flatIndexEnd: number;
}

interface FlatLineCollection {
    readonly tokenStart: FlatLineToken;
    readonly collectedTokens: ReadonlyArray<FlatLineToken>;
    readonly maybeTokenEnd: Option<FlatLineToken>;
}

interface LineTerminator {
    readonly codeUnit: number;
    readonly text: string;
}

interface FlatLineToken extends IToken<LineTokenKind, TokenPosition> {
    readonly flatIndex: number;
}
