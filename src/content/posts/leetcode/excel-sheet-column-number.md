---
title: "[LeetCode] 171. Excel Sheet Column Number"
date: "2019-09-05"
description: "Excel Sheet Column Number Link to original Problem on LeetCode Given a column title as appear in an Excel sheet, return its corresponding column number. For example: Example 1: Input: “A” Output: 1 Example 2: Input: “AB” Output: 28 Example 3: Input: “ZY” Output: 701 Company: Amazon Solution (Using Hash Map): Time Complexity: O(n) Space Complexity: O(1) class Solution(object): def titleToNumber(self, s): \"\"\" :type s: str :rtype: int \"\"\" # First create a dictionary containing key 'A' to 'Z' # assigning 'A': 1, 'B': 2, 'C': 3, ."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Excel", "Column Number", "Programming"]
draft: false
---

### Excel Sheet Column Number

[Link to original Problem on LeetCode](https://leetcode.com/problems/excel-sheet-column-number)

Given a column title as appear in an Excel sheet, return its corresponding column number.

**For example**:

**Example 1**:

**Input**: “A”

**Output**: 1

**Example 2**:

**Input**: “AB”

**Output**: 28

**Example 3**:

**Input**: “ZY”

**Output**: 701

**Company:** *Amazon*

**Solution (Using Hash Map):**

**Time Complexity:** O(n) **Space Complexity:** O(1)

```python
class Solution(object):
    def titleToNumber(self, s):
        """
        :type s: str
        :rtype: int
        """
        # First create a dictionary containing key 'A' to 'Z' 
        # assigning 'A': 1, 'B': 2, 'C': 3, ..., 'Z': 26
        # For element in position i, value = (26 ^ i) x (character number)
        # eg: if A is in 3rd position from left,
        # value = (26 ^ 2) x 1 = 676
        # We just need to add up all the values
        charDict = {chr(x): x - 64 for x in range(65, 65 + 26)}
        
        columnNumber = 0
        for i, char in enumerate(reversed(s)):
            columnNumber += 26 ** i * charDict[char]
            
        return columnNumber
```
