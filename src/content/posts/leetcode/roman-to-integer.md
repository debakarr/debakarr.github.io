---
title: "[LeetCode] 13. Roman to Integer"
date: "2019-08-28"
description: "Roman to Integer Link to original Problem on LeetCode Roman numerals are represented by seven different symbols: I, V, X, L, C, D and M. Symbol Value I 1 V 5 X 10 L 50 C 100 D 500 M 1000 For example, two is written as II in Roman numeral, just two one’s added together. Twelve is written as, XII, which is simply X + II. The number twenty seven is written as XXVIIi, which is XX + V + II."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Roman Numerals", "Conversion", "Programming"]
draft: false
---

### Roman to Integer

[Link to original Problem on LeetCode](https://leetcode.com/problems/roman-to-integer/)

Roman numerals are represented by seven different symbols: I, V, X, L, C, D and M.

**Symbol** **Value** I 1 V 5 X 10 L 50 C 100 D 500 M 1000

For example, two is written as **II** in Roman numeral, just two one’s added together. Twelve is written as, **XII**, which is simply **X + II**. The number twenty seven is written as **XXVIIi**, which is **XX + V + II**.

Roman numerals are usually written largest to smallest from left to right. However, the numeral for four is not **IIII**. Instead, the number four is written as **IV**. Because the one is before the five we subtract it making four. The same principle applies to the number nine, which is written as **IX**. There are six instances where subtraction is used:

**I** can be placed before **V** (5) and **X** (10) to make 4 and 9. **X** can be placed before **L** (50) and **C** (100) to make 40 and 90. **C** can be placed before **D** (500) and **M** (1000) to make 400 and 900. Given a roman numeral, convert it to an integer. Input is guaranteed to be within the range from 1 to 3999.

Example 1:

Input: “**III**” Output: 3 Example 2:

Input: “**IV**” Output: 4 Example 3:

Input: “**IX**” Output: 9 Example 4:

Input: “**LVIII**” Output: 58 Explanation: **L** = 50, **V**\= 5, **III** = 3. Example 5:

Input: “**MCMXCIV**” Output: 1994 Explanation: **M** = 1000, **CM** = 900, **XC** = 90 and **IV** = 4.

**Company:** *Yahoo*, *Google*, *Amazon*, *Microsoft*

**Solution**

**Time Complexity:** O(n)

**Space Complexity:** O(1) # Since the dictionary only takes a constant space

```python
Solution(object):
    def romanToInt(self, s):
        """
        :type s: str
        :rtype: int
        """
        # If we check the Roman number, there are basically 2 things which is happening
        # 1. Number correponding to the last letter is always added
        # 2. Except point 1. if the number corresponding to a letter is less than the number 
        #    corresponding to the letter next to that, then it will be subtracted, else added
        romanToIntDict = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
        result = 0
        
        for i in range(len(s) - 1):
            # Using 2.
            if romanToIntDict[s[i]] < romanToIntDict[s[i + 1]]:
                result += -romanToIntDict[s[i]]
            else:
                result += romanToIntDict[s[i]]
        
        # Using 1.
        result += romanToIntDict[s[-1]]
        
        return result
```
