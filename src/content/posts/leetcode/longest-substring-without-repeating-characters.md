---
title: "[LeetCode] 3. Longest Substring Without Repeating Characters"
date: "2019-05-14"
description: "Longest Substring Without Repeating Characters Link to original Problem on LeetCode Given a string, find the length of the longest substring without repeating characters. Example 1: Input: “abcabcbb” Output: 3 Explanation: The answer is “abc”, with the length of 3. Example 2: Input: “bbbbb” Output: 1 Explanation: The answer is “b”, with the length of 1. Example 3: Input: “pwwkew” Output: 3 Explanation: The answer is “wke”, with the length of 3."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Substring", "Strings", "Programming"]
draft: false
---

### Longest Substring Without Repeating Characters

[Link to original Problem on LeetCode](https://leetcode.com/problems/longest-substring-without-repeating-characters/)

Given a string, find the length of the longest substring without repeating characters.

**Example 1:**

> Input: “abcabcbb” Output: 3 Explanation: The answer is “abc”, with the length of 3.

**Example 2:**

> Input: “bbbbb” Output: 1 Explanation: The answer is “b”, with the length of 1.

**Example 3:**

> Input: “pwwkew” Output: 3 Explanation: The answer is “wke”, with the length of 3. Note that the answer must be a substring, “pwke” is a subsequence and not a substring.

**Company:** *Amazon*

**Solution:**

```python
class Solution(object):
    def lengthOfLongestSubstring(self, s):
        """
        :type s: str
        :rtype: int
        """
        # In this solution we are keeping a sliding window
        # As we move through the string we are keeping track of what character we have seen using hashmap
        # We have two pointers.
        # One to keep track of the index of current variable scanned
        # And other to move the sliding window in case the window have repeating characters
        secondPointer, maxLength = 0, 0
        charIndexDict = {}

        for firstPointer, char in enumerate(s):
            # In case the window have repeating character
            # Move the second pointer to the next index
            # of the previous occurence of currenty scanned character
            if char in charIndexDict:
                secondPointer = max(secondPointer, charIndexDict[char] + 1)
            # Add the index of the character in the hashmap
            charIndexDict[char] = firstPointer
            # Assign maxLength to new window size only if it has increased
            maxLength = max(maxLength, firstPointer - secondPointer + 1)

        return maxLength
```
