/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

import * as d3 from "d3";
import { map } from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

enum violationType {
    Missing = "MISSING",
    Did = "DID",
}

export interface Violation {
    key: string;
    violationType: violationType;
    violationActivity: string;
    caseIds: Array<Number>;
    specifications: Map<string, Specification>;
}

export interface Specification {
    name: string;
    caseIds: Array<Number>;
}

export class Visual implements IVisual {
    private violations: Map<string, Violation> = new Map();

    constructor(options: VisualConstructorOptions) {

    }

    public update(options: VisualUpdateOptions) {
        // Empty violations
        this.violations.clear();

        // Collect data from PowerBI
        let table = options.dataViews[0].table;

        // Get happy path array
        let happyPathArray = this.getHappyPathArray(table);

        // Search for violations
        if (happyPathArray.length != 0) {
            this.searchForViolations(table, happyPathArray);

            // Sort violations
            this.violations = new Map([...this.violations.entries()]
                .sort((a, b) => b[1].caseIds.length - a[1].caseIds.length));

            // Sort specifications
            this.violations.forEach(v => {
                v.specifications = new Map([...v.specifications.entries()]
                    .sort((a, b) => b[1].caseIds.length - a[1].caseIds.length));
            });

            // Log violations
            console.log(this.violations);
        }
    }

    private getHappyPathArray(table: powerbi.DataViewTable) {
        let happyPathArray = [];
        table.rows.forEach(row => {
            let ihp = row[1] + '';
            let variant = row[2] + '';
            if (ihp.toString() === 'true') {
                happyPathArray = variant.toString().split('->');
            }
        });
        return happyPathArray.map(a => a.trim());
    }

    private searchForViolations(table: powerbi.DataViewTable, happyPathArray: Array<string>) {
        table.rows.forEach(row => {
            let caseId = +row[0];
            let variant = row[2] + '';
            let specification = row[3] + '';

            let violationsKeys = this.getViolationPerCase(variant.toString(), happyPathArray);

            violationsKeys.forEach(keyArray => {
                let key = keyArray[0] + ':' + keyArray[1];

                if (this.violations.has(key)) {
                    this.violations.get(key).caseIds.push(caseId);
                } else {
                    this.violations.set(key, <Violation>{
                        key: key,
                        violationType: keyArray[0],
                        violationActivity: keyArray[1],
                        caseIds: [caseId],
                        specifications: new Map()
                    });
                }

                let violation = this.violations.get(key);

                if (violation.specifications.has(specification)) {
                    violation.specifications.get(specification).caseIds.push(caseId);
                } else {
                    violation.specifications.set(specification, <Specification>{
                        name: specification,
                        caseIds: [caseId]
                    });
                }
            });
        });
    }

    private getViolationPerCase(variant: string, happyPathArray: Array<string>) {
        let variantArray = variant.toString().split('->');
        variantArray = variantArray.map(a => a.trim());

        let set1 = new Set(happyPathArray);
        let set2 = new Set(variantArray);
        let violations = [];

        set1.forEach(function (val) {
            if (!set2.has(val)) violations.push(val);
        });
        set2.forEach(function (val) {
            if (!set1.has(val)) violations.push(val);
        });

        for (let i = 0; i < violations.length; i++) {
            if (happyPathArray.indexOf(violations[i]) !== -1) {
                violations[i] = ([violationType.Missing, violations[i]]);
            } else {
                violations[i] = ([violationType.Did, violations[i]]);
            }
        }
        return violations;
    }
}
