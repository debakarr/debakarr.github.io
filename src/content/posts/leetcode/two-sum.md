---
title: "[LeetCode] 1. Two Sum"
date: "2019-05-14"
description: "Two Sum Link to original Problem on LeetCode Given an array of integers, return indices of the two numbers such that they add up to a specific target. You may assume that each input would have exactly one solution, and you may not use the same element twice. Example: Given nums = [2, 7, 11, 15], target = 9, Because nums[0] + nums[1] = 2 + 7 = 9, return [0, 1]."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Two Sum", "Arrays", "Programming"]
draft: false
---

### Two Sum

[Link to original Problem on LeetCode](https://leetcode.com/problems/two-sum/)

Given an array of integers, return indices of the two numbers such that they add up to a specific target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

**Example:**

> Given nums = \[2, 7, 11, 15\], target = 9,

> Because nums\[0\] + nums\[1\] = 2 + 7 = 9, return \[0, 1\].

**Company:** *Facebook*, *Amazon*, *Google*

**Solution:**

```python
class Solution(object):
    def twoSum(self, nums, target):
        """
        :type nums: List[int]
        :type target: int
        :rtype: List[int]
        """
        # We can create a hashmap with key-value pair as number and it's index
        hashTable = {}

        for i, num in enumerate(nums):
            # We will search whether we have already encounter the target - current num value
            if target - num in hashTable:
                # If yes then we will return the index of
                # that encountered value and current value's index
                return [hashTable[target - num], i]
                break
            # In each iteration we are storing value and it's index in the hashmap
            hashTable[num] = i
```
