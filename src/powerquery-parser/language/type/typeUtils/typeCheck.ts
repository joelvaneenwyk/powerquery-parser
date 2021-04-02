// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Type } from "..";
import { ArrayUtils } from "../../../common";
import { isCompatible, isCompatibleWithFunctionParameter } from "./isCompatible";
import { isEqualFunctionParameter } from "./isEqualType";

export type TChecked =
    | CheckedDefinedFunction
    | CheckedDefinedList
    | CheckedDefinedRecord
    | CheckedDefinedTable
    | CheckedFunctionSignature;

export interface IChecked<
    Key,
    Actual extends Type.PowerQueryType | Type.FunctionParameter | undefined,
    Expected extends Type.PowerQueryType | Type.FunctionParameter
> {
    readonly valid: ReadonlyArray<Key>;
    readonly invalid: ReadonlyArray<Mismatch<Key, Actual, Expected>>;
    readonly extraneous: ReadonlyArray<Key>;
    readonly missing: ReadonlyArray<Key>;
}

export type CheckedDefinedList = IChecked<number, Type.PowerQueryType, Type.PowerQueryType>;

export interface CheckedDefinedFunction extends IChecked<number, Type.FunctionParameter, Type.FunctionParameter> {
    readonly isReturnTypeCompatible: boolean;
}

export type CheckedFunctionSignature = IChecked<number, Type.FunctionParameter, Type.FunctionParameter>;

export type CheckedDefinedRecord = IChecked<string, Type.PowerQueryType, Type.PowerQueryType>;

export type CheckedDefinedTable = IChecked<string, Type.PowerQueryType, Type.PowerQueryType>;

export type CheckedInvocation = IChecked<number, Type.PowerQueryType | undefined, Type.FunctionParameter>;

export interface Mismatch<Key, Actual, Expected> {
    readonly key: Key;
    readonly expected: Expected;
    readonly actual: Actual;
}

export function typeCheckFunction(
    valueType: Type.DefinedFunction,
    schemaType: Type.FunctionType,
): CheckedDefinedFunction {
    return {
        ...typeCheckFunctionSignature(valueType, schemaType),
        isReturnTypeCompatible: isCompatible(valueType.returnType, schemaType.returnType) === true,
    };
}

export function typeCheckFunctionSignature(
    valueType: Type.FunctionSignature,
    schemaType: Type.FunctionSignature,
): CheckedFunctionSignature {
    return typeCheckGenericNumber<Type.FunctionParameter, Type.FunctionParameter>(
        valueType.parameters,
        schemaType.parameters,
        (left: Type.FunctionParameter, right: Type.FunctionParameter) => isEqualFunctionParameter(left, right),
    );
}

export function typeCheckInvocation(
    args: ReadonlyArray<Type.PowerQueryType>,
    definedFunction: Type.DefinedFunction,
): CheckedInvocation {
    const parameters: ReadonlyArray<Type.FunctionParameter> = definedFunction.parameters;
    const numArgs: number = args.length;
    const numParameters: number = parameters.length;

    const extraneousArgs: ReadonlyArray<number> =
        numArgs > numParameters ? ArrayUtils.range(numArgs - numParameters, numParameters) : [];

    const validArgs: number[] = [];
    const missingArgs: number[] = [];
    const invalidArgs: Mismatch<number, Type.PowerQueryType | undefined, Type.FunctionParameter>[] = [];
    for (let index: number = 0; index < numParameters; index += 1) {
        const maybeArg: Type.PowerQueryType | undefined = args[index];
        const parameter: Type.FunctionParameter = parameters[index];

        if (isCompatibleWithFunctionParameter(maybeArg, parameter)) {
            validArgs.push(index);
        } else if (maybeArg !== undefined) {
            invalidArgs.push({
                key: index,
                expected: parameter,
                actual: maybeArg,
            });
        } else {
            missingArgs.push(index);
        }
    }

    return {
        valid: validArgs,
        invalid: invalidArgs,
        extraneous: extraneousArgs,
        missing: missingArgs,
    };
}

export function typeCheckListWithListType(valueType: Type.DefinedList, schemaType: Type.ListType): CheckedDefinedList {
    const valid: number[] = [];
    const invalid: Mismatch<number, Type.PowerQueryType, Type.PowerQueryType>[] = [];
    const schemaItemType: Type.PowerQueryType = schemaType.itemType;

    const valueElements: ReadonlyArray<Type.PowerQueryType> = valueType.elements;
    const numElements: number = valueElements.length;
    for (let index: number = 0; index < numElements; index += 1) {
        const element: Type.PowerQueryType = valueElements[index];
        if (isCompatible(element, schemaItemType)) {
            valid.push(index);
        } else {
            invalid.push({
                key: index,
                expected: schemaType,
                actual: element,
            });
        }
    }

    return {
        valid,
        invalid,
        extraneous: [],
        missing: [],
    };
}

export function typeCheckListWithDefinedListType(
    valueType: Type.DefinedList,
    schemaType: Type.DefinedListType,
): CheckedDefinedList {
    return typeCheckGenericNumber(valueType.elements, schemaType.itemTypes, isCompatible);
}

export function typeCheckRecord(valueType: Type.DefinedRecord, schemaType: Type.RecordType): CheckedDefinedRecord {
    return typeCheckRecordOrTable(valueType.fields, schemaType.fields, schemaType.isOpen);
}

export function typeCheckTable(valueType: Type.DefinedTable, schemaType: Type.TableType): CheckedDefinedTable {
    return typeCheckRecordOrTable(valueType.fields, schemaType.fields, schemaType.isOpen);
}

function typeCheckGenericNumber<
    Value extends Type.PowerQueryType | Type.FunctionParameter | undefined,
    Schema extends Type.PowerQueryType | Type.FunctionParameter
>(
    valueElements: ReadonlyArray<Value>,
    schemaItemTypes: ReadonlyArray<Schema>,
    valueCmpFn: (left: Value, right: Schema) => boolean | undefined,
): IChecked<number, Value, Schema> {
    const numElements: number = valueElements.length;
    const numItemTypes: number = schemaItemTypes.length;

    let upperBound: number;
    let extraneousIndices: ReadonlyArray<number>;
    let missingIndices: ReadonlyArray<number>;
    if (numElements > numItemTypes) {
        upperBound = numItemTypes;
        extraneousIndices = ArrayUtils.range(numElements - numItemTypes, numItemTypes);
        missingIndices = [];
    } else {
        upperBound = numElements;
        extraneousIndices = [];
        missingIndices = ArrayUtils.range(numItemTypes - numElements, numElements);
    }

    const validIndices: number[] = [];
    const mismatches: Mismatch<number, Value, Schema>[] = [];
    for (let index: number = 0; index < upperBound; index += 1) {
        const element: Value = valueElements[index];
        const schemaItemType: Schema = schemaItemTypes[index];

        if (valueCmpFn(element, schemaItemType)) {
            validIndices.push(index);
        } else {
            mismatches.push({
                key: index,
                expected: schemaItemType,
                actual: element,
            });
        }
    }

    return {
        valid: validIndices,
        invalid: mismatches,
        extraneous: extraneousIndices,
        missing: missingIndices,
    };
}

function typeCheckRecordOrTable(
    valueFields: Map<string, Type.PowerQueryType>,
    schemaFields: Map<string, Type.PowerQueryType>,
    schemaIsOpen: boolean,
): IChecked<string, Type.PowerQueryType, Type.PowerQueryType> {
    const validFields: string[] = [];
    const mismatches: Mismatch<string, Type.PowerQueryType, Type.PowerQueryType>[] = [];
    const extraneousFields: string[] = [];
    const missingFields: ReadonlyArray<string> = [...schemaFields.keys()].filter(
        (key: string) => !valueFields.has(key),
    );

    for (const [key, type] of valueFields.entries()) {
        const maybeSchemaValueType: Type.PowerQueryType | undefined = schemaFields.get(key);
        if (maybeSchemaValueType !== undefined) {
            const schemaValueType: Type.PowerQueryType = maybeSchemaValueType;

            if (isCompatible(type, schemaValueType)) {
                validFields.push(key);
            } else {
                mismatches.push({
                    key,
                    expected: schemaValueType,
                    actual: type,
                });
            }
        } else if (schemaIsOpen === true) {
            validFields.push(key);
        } else {
            extraneousFields.push(key);
        }
    }

    return {
        valid: validFields,
        invalid: mismatches,
        extraneous: extraneousFields,
        missing: missingFields,
    };
}
