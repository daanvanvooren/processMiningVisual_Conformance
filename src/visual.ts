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

export interface Violation {
    key: string;
    type: string;
    activity: string;
    caseid: number;
    vendor: string;
}

export interface ViolationFlattened {
    key: string;
    type: string;
    activity: string;
    caseids: Array<number>;
    vendors: Array<string>;
}

export interface ViolationFlattened2 {
    key: string;
    type: string;
    activity: string;
    caseids: Array<number>;
    vendors: Map<string, number>;
}

export class Visual implements IVisual {
    private violationsFlattened: Map<string, ViolationFlattened> = new Map();
    private violationsFlattened2: Map<string, ViolationFlattened2> = new Map();
    private happyPath: Array<any> = [];

    constructor(options: VisualConstructorOptions) {

    }

    public update(options: VisualUpdateOptions) {
        // Empty relationships
        this.violationsFlattened.clear();
        this.violationsFlattened2.clear();
        this.happyPath = [];

        // Collect data from PowerBI
        let table = options.dataViews[0].table;
        console.log(table);


        // Conformance check
        this.conformanceCheckingTest(table)

        // Log result
        // console.log(this.violationsFlattened2);
        this.logData(this.violationsFlattened2);
    }

    public logData(violationsFlattened2: Map<string, ViolationFlattened2>) {
        let sum = 0;

        violationsFlattened2.forEach(viol => {
            // log main problem
            console.log(viol.caseids.length + 'x ' + viol.type + ': ' + viol.activity);

            sum += viol.caseids.length

            // log sub
            viol.vendors.forEach(function (value, key) {
                console.log('\t' + value + 'x ' + key)
            })
        });

        console.log('totaal viols: ' + sum);
    }

    public conformanceCheckingTest(table: powerbi.DataViewTable) {
        // Happy Path array
        table.rows.forEach(row => {
            if (row[1].toString() === 'true') {
                this.happyPath = row[2].toString().split('->');
            }
        });
        this.happyPath = this.happyPath.map(s => s.trim());

        // Violation array opbouwen
        let violationArray: Array<Violation> = [];
        table.rows.forEach(row => {
            let variantArray = row[2].toString().split('->');
            variantArray = variantArray.map(s => s.trim());
            let arr = this.diffArray(this.happyPath, variantArray);
            if (arr.length != 0) {
                arr.forEach(element => {
                    violationArray.push(<Violation>{
                        key: (element[0] + ' ' + element[1]),
                        type: element[0],
                        activity: element[1],
                        caseid: +row[0],
                        vendor: row[3] + ''
                    });
                });
            }
        });

        // Violation array flatten
        violationArray.forEach(v => {
            if (!this.violationsFlattened.has(v.key)) {
                this.violationsFlattened.set(v.key, <ViolationFlattened>{
                    key: v.key,
                    type: v.type,
                    activity: v.activity,
                    caseids: [v.caseid],
                    vendors: [v.vendor]
                });
            } else {
                let viol = this.violationsFlattened.get(v.key);
                viol.caseids.push(v.caseid);
                viol.vendors.push(v.vendor);
            }
        })

        // Log flatten violation even further
        this.violationsFlattened.forEach(viol => {
            //console.log(viol.caseids.length + 'x \t' + viol.type + ' ' + viol.activity);

            //vendorlijst
            var a = [], b = [], prev;
            viol.vendors.sort();
            for (var i = 0; i < viol.vendors.length; i++) {
                if (viol.vendors[i] !== prev) {
                    a.push(viol.vendors[i]);
                    b.push(1);
                } else {
                    b[b.length - 1]++;
                }
                prev = viol.vendors[i];
            }

            let vendors: Map<string, number> = new Map();

            for (let i = 0; i < a.length; i++) {
                //console.log("\t" + b[i] + ' ' + a[i]);
                vendors.set(a[i], b[i]);
            }

            vendors = new Map([...vendors.entries()].sort((a, b) => b[1] - a[1]));

            this.violationsFlattened2.set(viol.key, <ViolationFlattened2>{
                key: viol.key,
                type: viol.type,
                activity: viol.activity,
                caseids: viol.caseids,
                vendors: vendors
            });

        });

        this.violationsFlattened2 = new Map([...this.violationsFlattened2.entries()].sort((a, b) => b[1].caseids.length - a[1].caseids.length));
    }

    public diffArray(hp, arr2) {
        var set1 = new Set(hp);
        var set2 = new Set(arr2);
        var arr = []

        set1.forEach(function (val) {
            if (!set2.has(val)) arr.push(val);
        });
        set2.forEach(function (val) {
            if (!set1.has(val)) arr.push(val);
        });

        for (let i = 0; i < arr.length; i++) {
            if (hp.includes(arr[i]))
                arr[i] = (['MISSING', arr[i]]);
            else
                arr[i] = (['DID', arr[i]]);
        }
        return arr;
    }
}
