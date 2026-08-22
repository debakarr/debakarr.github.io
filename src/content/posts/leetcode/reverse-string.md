---
title: "[LeetCode] 344. Reverse String"
date: "2019-07-23"
description: "Reverse String Link to original Problem on LeetCode Write a function that reverses a string. The input string is given as an array of characters char[]. Do not allocate extra space for another array, you must do this by modifying the input array in-place with O(1) extra memory. You may assume all the characters consist of printable ascii characters. Example 1: Input: [“h”,“e”,“l”,“l”,“o”] Output: [“o”,“l”,“l”,“e”,“h”] Example 2: Input: [“H”,“a”,“n”,“n”,“a”,“h”] Output: [“h”,“a”,“n”,“n”,“a”,“H”]"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Reverse String", "Two Pointers", "String", "LeetCode", "Algorithm"]
draft: false
---

### Reverse String

[Link to original Problem on LeetCode](https://leetcode.com/problems/reverse-string//)

Write a function that reverses a string. The input string is given as an array of characters char\[\].

**Do not allocate extra space for another array, you must do this by modifying the input array in-place with O(1) extra memory.**

You may assume all the characters consist of printable ascii characters.

**Example 1:**

**Input:** \[“h”,“e”,“l”,“l”,“o”\] **Output:** \[“o”,“l”,“l”,“e”,“h”\]

**Example 2:**

**Input:** \[“H”,“a”,“n”,“n”,“a”,“h”\] **Output:** \[“h”,“a”,“n”,“n”,“a”,“H”\]

**Company:**

**Solution (Python Way):**

```python
class Solution(object):
    def reverseString(self, s):
        """
        :type s: List[str]
        :rtype: None Do not return anything, modify s in-place instead.
        """
        # Using [::-1] to reverse the string
        s[:] = s[::-1]
```

**Solution (Iterative):**

```python
class Solution(object):
    def reverseString(self, s):
        """
        :type s: List[str]
        :rtype: None Do not return anything, modify s in-place instead.
        """
        # Keep two reference to the first and the last element of the list, say left and right respectively
        # Now until left is greater than right, swap left and right element and increament left and decreament right
        left, right = 0, len(s) - 1
        
        while left <= right:
            s[left], s[right] = s[right], s[left]
            left += 1
            right -= 1
```

**Solution (Recursive):**

```python
class Solution(object):
    def reverseString(self, s):
        """
        :type s: List[str]
        :rtype: None Do not return anything, modify s in-place instead.
        """
        # Logic is same as the one in iterative solution
        if not len(s):
            return []
        
        self.reverseStringHelper(0, len(s) - 1, s)
        
    def reverseStringHelper(self, left, right, s):
        if left >= right:
            return
        s[left], s[right] = s[right], s[left]
        self.reverseStringHelper(left + 1, right - 1, s)
```
