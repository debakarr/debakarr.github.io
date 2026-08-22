---
title: "[LeetCode] 22. Generate Parentheses"
date: "2019-07-23"
description: "Generate Parentheses Link to original Problem on LeetCode Given n pairs of parentheses, write a function to generate all combinations of well-formed parentheses. For example, given n = 3, a solution set is: [ “((()))”, “(()())”, “(())()”, “()(())”, “()()()” ] Company: Microsoft, Facebook Solution (Backtracking and Recursion): Time Complexity: Space Complexity: class Solution(object): def generateParenthesis(self, n): \"\"\" :type n: int :rtype: List[str] \"\"\" result = [] self.generateParenthesisHelper(n, n, \"\", result) return result def generateParenthesisHelper(self, left, right, path, result): if left > right: return if left == 0 and right == 0: result."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Generate Parentheses", "Backtracking", "String", "LeetCode", "Algorithm"]
draft: false
---

### Generate Parentheses

[Link to original Problem on LeetCode](https://leetcode.com/problems/generate-parentheses/)

Given n pairs of parentheses, write a function to generate all combinations of **well-formed parentheses**.

For example, given n = 3, a solution set is:

\[ “((()))”, “(()())”, “(())()”, “()(())”, “()()()” \]

**Company:** *Microsoft*, *Facebook*

**Solution (Backtracking and Recursion):**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def generateParenthesis(self, n):
        """
        :type n: int
        :rtype: List[str]
        """
        result = []
        self.generateParenthesisHelper(n, n, "", result)
        return result
    
    def generateParenthesisHelper(self, left, right, path, result):
        if left > right:
            return
        
        if left == 0 and right == 0:
            result.append(path)
            
        if left:
            self.generateParenthesisHelper(left - 1, right, path + "(", result)
            
        if right:
            self.generateParenthesisHelper(left, right - 1, path + ")", result)
```

**Explanation:**

Following is how the recursion is working:

```
generateParenthesisHelper(2, 2, [], "")
        generateParenthesisHelper(1, 2, [], "(")
                generateParenthesisHelper(0, 2, [], "((")
                        generateParenthesisHelper(0, 1, [], "(()")
                                generateParenthesisHelper(0, 0, [], "(())") # We got "(())" and we append it to ans
                generateParenthesisHelper(1, 1, ["(())"], "()")
                        generateParenthesisHelper(0, 1, ["(())"], "()(")
                                generateParenthesisHelper(0, 0, ["(())"], "()()") # We got "(())" and we append it to ans
                        generateParenthesisHelper(1, 0, ["(())", "()()"], "())") # will just return as right < left
        generateParenthesisHelper(2, 1, ["(())", "()()"], ")") # will just return as right < left
```
